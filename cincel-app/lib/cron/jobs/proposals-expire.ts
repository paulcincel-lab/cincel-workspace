/**
 * Cron job `proposals-expire` (Calendario BE §3.6). Once per local day (window
 * `proposals-expire:<YYYY-MM-DD>`): `propuesta` rows past `expires_at` become
 * `expirada`, and proposals older than 90 days are deleted.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";
import { localIsoDate } from "@/lib/dashboard/task-trend";
import { expireProposals } from "@/lib/repositories/proposals-repository";

export const proposalsExpireJob: CronJob = {
  name: "proposals-expire",
  due: (now, tz) => ({ run: true, windowKey: `proposals-expire:${localIsoDate(now, tz)}` }),
  run: async ({ now }) => {
    const { expired, deleted } = await expireProposals(now);
    return { count: expired + deleted };
  },
};

registerJob(proposalsExpireJob);
