package com.nexigentlabs.portfolio;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves the portfolio content (profile, experience, projects, skills, certifications).
 * The single source of truth is src/main/resources/portfolio.json — edit it and redeploy.
 */
@RestController
@RequestMapping("/api")
public class PortfolioController {

    private final byte[] portfolioJson;

    public PortfolioController() throws IOException {
        try (InputStream in = new ClassPathResource("portfolio.json").getInputStream()) {
            this.portfolioJson = in.readAllBytes();
        }
    }

    @GetMapping(value = "/portfolio", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> portfolio() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic())
                .contentType(MediaType.APPLICATION_JSON)
                .body(portfolioJson);
    }
}
