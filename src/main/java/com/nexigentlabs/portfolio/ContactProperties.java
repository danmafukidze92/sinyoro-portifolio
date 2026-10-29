package com.nexigentlabs.portfolio;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Contact-form settings (application.yml → app.contact.*).
 *
 * @param to             where contact messages are emailed
 * @param from           sender address used for the notification email
 * @param storeDir       directory where every message is also appended to messages.log
 * @param maxPerHour     max submissions accepted per client IP per hour
 */
@ConfigurationProperties(prefix = "app.contact")
public record ContactProperties(String to, String from, String storeDir, int maxPerHour) {

    public ContactProperties {
        if (storeDir == null || storeDir.isBlank()) storeDir = "./data";
        if (maxPerHour <= 0) maxPerHour = 5;
    }
}
