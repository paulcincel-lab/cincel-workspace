/** Imports every cron job file so each registers itself (redesign BE §8.0.4). One line per job. */
import "./notifications-deliver";
import "./daily-digest";
import "./reminders-fire";
import "./gmail-sync";
import "./auto-close-jornadas";
