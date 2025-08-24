// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB error:", err));

// User schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  points: { type: Number, default: 0 }
});

const rewardSchema = new mongoose.Schema({
  title: String,
  description: String,
  pointsRequired: Number
});

const User = mongoose.model("User", userSchema);
const Reward = mongoose.model("Reward", rewardSchema);

// Routes
app.get("/", (req, res) => res.send("🌍 Eco Reward API Running"));

// Create user
app.post("/users", async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all users
app.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Add points to a user
app.post("/users/:id/add-points", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.points += req.body.points;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Redeem reward
app.post("/users/:id/redeem/:rewardId", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const reward = await Reward.findById(req.params.rewardId);

    if (user.points >= reward.pointsRequired) {
      user.points -= reward.pointsRequired;
      await user.save();
      res.json({ message: "Reward redeemed!", user });
    } else {
      res.status(400).json({ error: "Not enough points" });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add reward
app.post("/rewards", async (req, res) => {
  try {
    const reward = new Reward(req.body);
    await reward.save();
    res.json(reward);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all rewards
app.get("/rewards", async (req, res) => {
  const rewards = await Reward.find();
  res.json(rewards);
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
