package com.nexigentlabs.portfolio;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Receives messages from the contact form. Every message is appended to
 * {storeDir}/messages.log and, when SMTP is configured (spring.mail.host), emailed.
 */
@RestController
@RequestMapping("/api")
public class ContactController {

    private static final Logger log = LoggerFactory.getLogger(ContactController.class);

    public record ContactRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Email @Size(max = 200) String email,
            @NotBlank @Size(min = 10, max = 4000) String message,
            /* honeypot — real visitors never fill this in */
            String website) {
    }

    private final ContactProperties props;
    private final ObjectProvider<JavaMailSender> mailSender;
    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    public ContactController(ContactProperties props, ObjectProvider<JavaMailSender> mailSender) {
        this.props = props;
        this.mailSender = mailSender;
    }

    @PostMapping("/contact")
    public ResponseEntity<Map<String, Object>> contact(@Valid @RequestBody ContactRequest req,
                                                       HttpServletRequest http) {
        if (req.website() != null && !req.website().isBlank()) {
            // Bot: pretend it worked.
            return ResponseEntity.ok(Map.of("ok", true));
        }
        String ip = http.getRemoteAddr();
        if (!allow(ip)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("ok", false, "error", "Too many messages — please try again later."));
        }

        store(req, ip);
        boolean emailed = email(req);
        return ResponseEntity.ok(Map.of("ok", true, "emailed", emailed));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException ex) {
        String field = ex.getBindingResult().getFieldErrors().isEmpty()
                ? "form" : ex.getBindingResult().getFieldErrors().getFirst().getField();
        return ResponseEntity.badRequest()
                .body(Map.of("ok", false, "error", "Please check the " + field + " field."));
    }

    private boolean allow(String ip) {
        long now = System.currentTimeMillis();
        long windowStart = now - 3_600_000L;
        Deque<Long> q = hits.computeIfAbsent(ip, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst() < windowStart) q.pollFirst();
            if (q.size() >= props.maxPerHour()) return false;
            q.addLast(now);
            return true;
        }
    }

    private void store(ContactRequest req, String ip) {
        try {
            Path dir = Path.of(props.storeDir());
            Files.createDirectories(dir);
            String line = "%s | %s | %s <%s> | %s%n".formatted(
                    Instant.now(), ip, req.name(), req.email(), req.message().replaceAll("\\s+", " "));
            Files.writeString(dir.resolve("messages.log"), line, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            log.warn("Could not store contact message: {}", e.getMessage());
        }
        log.info("Contact message from {} <{}>", req.name(), req.email());
    }

    private boolean email(ContactRequest req) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null || props.to() == null || props.to().isBlank()) return false;
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setTo(props.to());
            if (props.from() != null && !props.from().isBlank()) msg.setFrom(props.from());
            msg.setReplyTo(req.email());
            msg.setSubject("Portfolio message from " + req.name());
            msg.setText(req.message() + "\n\n— " + req.name() + " <" + req.email() + ">");
            sender.send(msg);
            return true;
        } catch (Exception e) {
            log.warn("Could not email contact message: {}", e.getMessage());
            return false;
        }
    }
}
