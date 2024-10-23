import { Bot, webhookCallback } from "npm:grammy";
import "jsr:@std/dotenv/load";
import { WorkoutSet } from "./types/WorkoutSet.ts";
import { formatWorkoutDetails } from "./utils/formatWorkout.ts";
// Bot and KV setup
const bot = new Bot(Deno.env.get("TELEGRAM_API_TOKEN") ?? "");
const kv = await Deno.openKv();

// Bot commands
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Welcome to Strong CSV Bot! 💪\n" +
      "Send me your Strong app CSV export and I'll store your workouts.\n" +
      "Commands:\n" +
      "/recent - View your recent workout highlights"
  );
});

// Handle CSV file uploads
bot.on("message:document", async (ctx) => {
  if (ctx.message.document.file_name?.endsWith(".csv")) {
    try {
      // Get file
      const file = await ctx.getFile();
      const filePath = file.file_path;

      if (!filePath) {
        await ctx.reply("Couldn't get the file path.");
        return;
      }

      // Download file content
      const response = await fetch(
        `https://api.telegram.org/file/bot${bot.token}/${filePath}`
      );
      const csvContent = await response.text();

      // Parse CSV
      const lines = csvContent.trim().split("\n");
      const headers = lines[0].split(",");
      const sets: WorkoutSet[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",");
        if (values.length >= headers.length) {
          sets.push({
            date: values[0],
            workoutName: values[1],
            duration: values[2],
            exerciseName: values[3],
            setOrder: Number(values[4]),
            weight: Number(values[5]),
            reps: Number(values[6]),
            distance: values[7],
            seconds: values[8],
            notes: values[9] ?? undefined,
            workoutNotes: values[10],
            rpe: values[11],
          });
        }
      }

      // Store in KV under user's ID
      const userId = ctx.from.id.toString();
      await kv.set(["workouts", userId], sets);

      await ctx.reply(
        `Processed ${sets.length} sets!\n` +
          "Use /recent to view your recent workouts highlights"
      );
    } catch (error) {
      console.error("Error processing CSV:", error);
      await ctx.reply("Error processing the CSV file.");
    }
  }
});

// View history command
bot.command("recent", async (ctx) => {
  const userId = ctx?.from?.id.toString();
  if (!userId) {
    await ctx.reply("Error: unable to get user id");
    return;
  }

  const result = await kv.get(["workouts", userId]);
  if (!result.value) {
    await ctx.reply("No recent work outs found. Upload a CSV file first!");
    return;
  }

  const workouts = result.value as WorkoutSet[];
  let message = "💪 *Last 3 Workouts - Top Sets*\n\n";

  // Group by date and workout name
  const workoutsByDate = new Map<string, Map<string, WorkoutSet[]>>();

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

  // Sort dates in reverse chronological order
  const sortedDates = Array.from(workoutsByDate.keys())
    .sort()
    .reverse()
    .slice(0, 3); // Get last 3 workout dates

  for (const date of sortedDates) {
    const workoutMap = workoutsByDate.get(date)!;
    message += `\n📅 *${date}*\n`;

    // Process each exercise
    for (const [exercise, sets] of workoutMap) {
      // Find the heaviest set
      const topSet = sets.reduce((heaviest, current) => {
        return current.weight > heaviest.weight ? current : heaviest;
      });

      message += `\n🏋️ ${exercise}\n`;
      message += `   Best Set: ${topSet.weight}kg × ${topSet.reps} reps`;
      if (topSet.rpe) {
        message += ` (RPE: ${topSet.rpe})`;
      }
      message += "\n";
    }

    message += "\n"; // Add spacing between dates
  }

  // Add summary
  message += "\n📊 *Total Summary*\n";
  message += `Total workouts: ${Array.from(workoutsByDate.keys()).length}\n`;
  message += `Showing latest ${sortedDates.length} workouts`;

  try {
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error sending message:", error);
    await ctx.reply("Error displaying workout history. Try again later.");
  }
});

// Error handler
bot.catch((err) => {
  console.error("Error in the bot:", err);
});

// Webhook handler
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
