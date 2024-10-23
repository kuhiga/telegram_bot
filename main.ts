import { Bot, webhookCallback } from "npm:grammy";
import "jsr:@std/dotenv/load";

// Bot and KV setup
const bot = new Bot(Deno.env.get("TELEGRAM_API_TOKEN") ?? "");
const kv = await Deno.openKv();

interface WorkoutSet {
  date: string;
  workoutName: string;
  duration: string;
  exerciseName: string;
  setOrder: number;
  weight: number;
  reps: number;
  distance?: any;
  seconds?: any;
  notes?: string;
  workoutNotes?: string;
  rpe?: string;
}

// Bot commands
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Welcome to Strong CSV Bot! 💪\n" +
      "Send me your Strong app CSV export and I'll store your workouts.\n" +
      "Commands:\n" +
      "/history - View your workout history"
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
          "Use /history to view your workouts"
      );
    } catch (error) {
      console.error("Error processing CSV:", error);
      await ctx.reply("Error processing the CSV file.");
    }
  }
});

// View history command
bot.command("history", async (ctx) => {
  const userId = ctx?.from?.id.toString();
  if (!userId) {
    await ctx.reply("Error: unable to get user id");
    return;
  }
  const result = await kv.get(["workouts", userId]);

  if (!result.value) {
    await ctx.reply("No workout history found. Upload a CSV file first!");
    return;
  }

  const workouts = result.value as WorkoutSet[];

  let message = "Recent Workouts:\n\n";
  const workoutsByDate = new Map();

  // Group by date
  workouts.forEach((set) => {
    if (!workoutsByDate.has(set.date)) {
      workoutsByDate.set(set.date, []);
    }
    workoutsByDate.get(set.date).push(set);
  });

  // Create summary
  for (const [date, sets] of workoutsByDate) {
    message += `📅 ${date}\n`;
    const exercises = new Set(sets.map((s: WorkoutSet) => s.exerciseName));
    message += `Exercises: ${Array.from(exercises).join(", ")}\n\n`;
  }

  await ctx.reply(message);
});

// Error handler
bot.catch((err) => {
  console.error("Error in bot:", err);
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
