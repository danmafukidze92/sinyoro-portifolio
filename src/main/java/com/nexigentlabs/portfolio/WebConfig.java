package com.nexigentlabs.portfolio;

import java.io.IOException;
import java.time.Duration;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Vite fingerprints everything under /assets, so it can be cached for a year.
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/static/assets/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }

    /** Security headers + no-cache for the HTML shell so new deploys show up immediately. */
    @Bean
    public Filter securityHeadersFilter() {
        return new Filter() {
            @Override
            public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
                    throws IOException, ServletException {
                HttpServletResponse r = (HttpServletResponse) res;
                String path = ((HttpServletRequest) req).getRequestURI();
                r.setHeader("X-Content-Type-Options", "nosniff");
                r.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
                r.setHeader("X-Frame-Options", "SAMEORIGIN");
                r.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
                r.setHeader("Content-Security-Policy",
                        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
                                + "script-src 'self'; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; "
                                + "frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
                if ("/".equals(path) || path.endsWith(".html")) {
                    r.setHeader("Cache-Control", "no-cache");
                }
                chain.doFilter(req, res);
            }
        };
    }
}
