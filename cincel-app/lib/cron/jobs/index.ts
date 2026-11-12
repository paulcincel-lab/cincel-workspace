/** Imports every cron job file so each registers itself (redesign BE §8.0.4). One line per job. */
// Jobs run in import order: reminders fire before delivery so their email leaves in the same tick (BE §17 item 4).
import "./reminders-fire";
import "./notifications-deliver";
import "./daily-digest";
import "./gmail-sync";
import "./auto-close-jornadas";
import "./proposals-expire";
