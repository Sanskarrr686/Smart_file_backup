package com.apnileap.scheduler.scheduler;

import com.apnileap.scheduler.entity.BackupJob;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalTime;

@Component
@RequiredArgsConstructor
public class PreferredWindowPolicy {
    private final Clock clock;

    public boolean allows(BackupJob job) {
        String window = job.getPreferredWindow();
        if (window == null || window.isBlank() || "ANY".equalsIgnoreCase(window)) {
            return true;
        }
        int hour = LocalTime.now(clock).getHour();
        boolean daytime = hour >= 6 && hour < 18;
        if ("DAY".equalsIgnoreCase(window) || "DAYTIME".equalsIgnoreCase(window)) {
            return daytime;
        }
        if ("NIGHT".equalsIgnoreCase(window)) {
            return !daytime;
        }
        return true;
    }
}
