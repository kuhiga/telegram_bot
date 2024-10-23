import { Bot, webhookCallback } from "npm:grammy";
import "jsr:@std/dotenv/load";
import { WorkoutSet } from "./types/WorkoutSet.ts";
import { parseCSV } from "./utils/parseCsv.ts";
// Constants
const BOT_TOKEN = Deno.env.get("TELEGRAM_API_TOKEN") ?? "";
const WELCOME_MESSAGE = `Welcome to Strong CSV Bot! 💪
Send me your Strong app CSV export and I'll store your workouts.
Commands:
/recent - View your recent workout highlights
/last [type] - View your last workout of specific type`;

// Initialize bot and KV store
const bot = new Bot(BOT_TOKEN);
const kv = await Deno.openKv();

const formatWorkoutSummary = (
  exercise: string,
  topSet: WorkoutSet,
  includeHeader = true
): string => {
  let message = includeHeader ? `🏋️ ${exercise}\n` : "";
  message += `   Best Set: ${topSet.weight}lbs × ${topSet.reps} reps`;
  if (topSet.rpe) {
    message += ` (RPE: ${topSet.rpe})`;
  }
  return message + "\n";
};

// Command Handlers
bot.command("start", async (ctx) => {
  await ctx.reply(WELCOME_MESSAGE);
});

bot.command("last", async (ctx) => {
  const userId = ctx?.from?.id.toString();
  if (!userId) {
    await ctx.reply("Error: unable to get user id");
    return;
  }

  const workoutType = ctx?.message?.text.split(" ")[1]?.trim();
  if (!workoutType) {
    await ctx.reply("Please specify workout type (e.g., /last Push)");
    return;
  }

  const result = await kv.get(["workouts", userId]);
  if (!result.value) {
    await ctx.reply("No workouts found. Upload a CSV file first!");
    return;
  }

  const workouts = result.value as WorkoutSet[];
  const workoutsByDate = new Map<string, WorkoutSet[]>();

  // Group workouts by date
  workouts.forEach((workout: WorkoutSet) => {
    console.log("workout name is " + workout.workoutName);
    if (workout.workoutName.toLowerCase() === workoutType.toLowerCase()) {
      if (!workoutsByDate.has(workout.date)) {
        workoutsByDate.set(workout.date, []);
      }
      workoutsByDate.get(workout.date)?.push(workout);
    }
  });

  if (workoutsByDate.size === 0) {
    await ctx.reply(`No '${workoutType}' workouts found`);
    return;
  }

  const lastDate = Array.from(workoutsByDate.keys()).sort().reverse()[0];
  const lastWorkout = workoutsByDate.get(lastDate)!;

  // Group exercises and find top sets
  const exerciseMap = new Map<string, WorkoutSet[]>();
  lastWorkout.forEach((set) => {
    if (!exerciseMap.has(set.exerciseName)) {
      exerciseMap.set(set.exerciseName, []);
    }
    exerciseMap.get(set.exerciseName)?.push(set);
  });

  let message = `💪 *Last ${workoutType} Workout Highlights*\n\n`;
  message += `📅 *${lastDate}*\n`;
  message += `Workout: ${workoutType}\n\n`;

  // Format exercise summaries
  for (const [exercise, sets] of exerciseMap) {
    const topSet = sets.reduce((heaviest, current) =>
      current.weight > heaviest.weight ? current : heaviest
    );
    message += formatWorkoutSummary(exercise, topSet);
  }

  // Add workout metadata
  if (lastWorkout[0]?.duration) {
    message += `\n⏱ Duration: ${lastWorkout[0].duration}\n`;
  }
  if (lastWorkout[0]?.workoutNotes) {
    message += `📝 Notes: ${lastWorkout[0].workoutNotes}\n`;
  }

  try {
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error sending message:", error);
    await ctx.reply("Error displaying workout. Try again later.");
  }
});

bot.command("recent", async (ctx) => {
  const userId = ctx?.from?.id.toString();
  if (!userId) {
    await ctx.reply("Error: unable to get user id");
    return;
  }

  const result = await kv.get(["workouts", userId]);
  if (!result.value) {
    await ctx.reply("No workouts found. Upload a CSV file first!");
    return;
  }

  const workouts = result.value as WorkoutSet[];
  const workoutsByDate = new Map<string, Map<string, WorkoutSet[]>>();

  // Group workouts by date and exercise
  workouts.forEach((set) => {
    if (!workoutsByDate.has(set.date)) {
      workoutsByDate.set(set.date, new Map());
    }
    const workoutMap = workoutsByDate.get(set.date)!;

    if (!workoutMap.has(set.exerciseName)) {
      workoutMap.set(set.exerciseName, []);
    }
    workoutMap.get(set.exerciseName)?.push(set);
  });

  const sortedDates = Array.from(workoutsByDate.keys())
    .sort()
    .reverse()
    .slice(0, 3);

  let message = "💪 *Last 3 Workouts - Top Sets*\n\n";

  // Format workout summaries
  for (const date of sortedDates) {
    const workoutMap = workoutsByDate.get(date)!;
    message += `\n📅 *${date}*\n`;

    for (const [exercise, sets] of workoutMap) {
      const topSet = sets.reduce((heaviest, current) =>
        current.weight > heaviest.weight ? current : heaviest
      );
      message += formatWorkoutSummary(exercise, topSet);
    }
    message += "\n";
  }

  // Add summary
  message += `📊 *Total Summary*\n`;
  message += `Total workouts: ${workoutsByDate.size}\n`;
  message += `Showing latest ${sortedDates.length} workouts`;

  try {
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error sending message:", error);
    await ctx.reply("Error displaying workout history. Try again later.");
  }
});

// File upload handler
bot.on("message:document", async (ctx) => {
  if (!ctx.message.document.file_name?.endsWith(".csv")) return;

  try {
    const file = await ctx.getFile();
    if (!file.file_path) {
      await ctx.reply("Couldn't get the file path.");
      return;
    }

    const response = await fetch(
      `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`
    );
    const csvContent = await response.text();
    const sets = parseCSV(csvContent);

    // Store in KV under user's ID
    const userId = ctx.from.id.toString();
    await kv.set(["workouts", userId], sets);

    await ctx.reply(
      `Processed ${sets.length} sets!\nUse /recent to view your recent workouts highlights`
    );
  } catch (error) {
    console.error("Error processing CSV:", error);
    await ctx.reply("Error processing the CSV file.");
  }
});

// Error handling
bot.catch((err) => {
  console.error("Error in the bot:", err);
});

// Webhook setup
const handleUpdate = webhookCallback(bot, "std/http");

// Server
Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === bot.token) {
      try {
        return await handleUpdate(req);
      } catch (err) {
        console.error(err);
        return new Response("Error", { status: 500 });
      }
    }
  }
  return new Response("OK");
});
