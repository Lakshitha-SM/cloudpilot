"""
backend/mobile_api.py
CloudPilot Mobile API — auth, rewards, profile, history
"""
import uuid
import random
import hashlib
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.database import db

mobile_router = APIRouter(prefix="/api/mobile", tags=["Mobile"])

# ── Models ────────────────────────────────────────────────────────────────────

class UserSignup(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

# ── Helpers ───────────────────────────────────────────────────────────────────

def hash_password(pwd: str) -> str:
    return hashlib.sha256(pwd.encode()).hexdigest()

def _ensure_tables():
    """Ensure last_spin column and user_challenges table exist."""
    with db._conn() as con:
        try:
            con.execute("ALTER TABLE users ADD COLUMN last_spin TEXT")
        except Exception:
            pass
        con.execute("""
            CREATE TABLE IF NOT EXISTS user_challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                challenge_id TEXT,
                completed INTEGER DEFAULT 1,
                claimed INTEGER DEFAULT 0,
                completed_at TEXT,
                claimed_at TEXT,
                UNIQUE(user_id, challenge_id)
            )
        """)

_ensure_tables()

# ── Auth ──────────────────────────────────────────────────────────────────────

@mobile_router.post("/auth/signup")
def signup(req: UserSignup):
    with db._conn() as con:
        existing = con.execute("SELECT id FROM users WHERE email=?", (req.email,)).fetchone()
        if existing:
            raise HTTPException(400, "Email already exists")
        con.execute(
            "INSERT INTO users (email, password_hash, credits) VALUES (?, ?, 100)",
            (req.email, hash_password(req.password))
        )
        user = con.execute(
            "SELECT id, email, credits, daily_streak, last_checkin, last_spin FROM users WHERE email=?",
            (req.email,)
        ).fetchone()
    return {"token": str(uuid.uuid4()), "user": dict(user)}

@mobile_router.post("/auth/login")
def login(req: UserLogin):
    with db._conn() as con:
        user = con.execute(
            "SELECT id, email, credits, daily_streak, last_checkin, last_spin FROM users "
            "WHERE email=? AND password_hash=?",
            (req.email, hash_password(req.password))
        ).fetchone()
        if not user:
            raise HTTPException(401, "Invalid credentials")
    return {"token": str(uuid.uuid4()), "user": dict(user)}

# ── Profile ───────────────────────────────────────────────────────────────────

@mobile_router.get("/profile/{user_id}")
def get_profile(user_id: int):
    with db._conn() as con:
        user = con.execute(
            "SELECT id, email, credits, daily_streak, last_checkin, last_spin FROM users WHERE id=?",
            (user_id,)
        ).fetchone()
        if not user:
            raise HTTPException(404, "User not found")
        history = con.execute(
            "SELECT * FROM credits_history WHERE user_id=? ORDER BY id DESC LIMIT 10",
            (user_id,)
        ).fetchall()
    return {"user": dict(user), "history": [dict(h) for h in history]}

# ── Rewards: Daily Check-in ───────────────────────────────────────────────────

@mobile_router.post("/rewards/checkin")
def daily_checkin(user_id: int):
    today = datetime.now().strftime("%Y-%m-%d")
    with db._conn() as con:
        user = con.execute(
            "SELECT id, credits, daily_streak, last_checkin FROM users WHERE id=?",
            (user_id,)
        ).fetchone()
        if not user:
            raise HTTPException(404, "User not found")

        last_checkin = (user["last_checkin"] or "")[:10]  # date part only
        if last_checkin == today:
            raise HTTPException(400, "Already checked in today")

        new_streak = user["daily_streak"] + 1

        # Streak rewards: Day 1=20, 2=20, 3=30, 4=30, 5=50, 6=50, 7=100
        streak_rewards = {1: 20, 2: 20, 3: 30, 4: 30, 5: 50, 6: 50, 7: 100}
        day_in_cycle = ((new_streak - 1) % 7) + 1
        reward = streak_rewards.get(day_in_cycle, 20)

        new_credits = user["credits"] + reward

        con.execute(
            "UPDATE users SET credits=?, daily_streak=?, last_checkin=? WHERE id=?",
            (new_credits, new_streak, today, user_id)
        )
        con.execute(
            "INSERT INTO credits_history (user_id, amount, reason, timestamp) VALUES (?,?,?,?)",
            (user_id, reward, f"Daily Check-in (Day {day_in_cycle})", db._ts())
        )

    return {
        "status": "SUCCESS",
        "reward": reward,
        "new_streak": new_streak,
        "day_in_cycle": day_in_cycle,
        "new_credits": new_credits,
    }

# ── Rewards: Daily Spin ───────────────────────────────────────────────────────

SPIN_REWARDS = [10, 20, 30, 50, 20, 30, 10, 50]  # 8 segments

@mobile_router.get("/rewards/spin/status")
def spin_status(user_id: int):
    """Check if user is eligible for daily spin."""
    today = datetime.now().strftime("%Y-%m-%d")
    with db._conn() as con:
        user = con.execute("SELECT id, credits, last_spin FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")
        last_spin = (user["last_spin"] or "")[:10]
        can_spin = last_spin != today
    return {
        "can_spin": can_spin,
        "last_spin": user["last_spin"],
        "today": today,
        "reason": None if can_spin else "Daily spin already used. Come back tomorrow.",
    }

@mobile_router.post("/rewards/spin")
def daily_spin(user_id: int):
    today = datetime.now().strftime("%Y-%m-%d")
    with db._conn() as con:
        user = con.execute("SELECT id, credits, last_spin FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")

        last_spin = (user["last_spin"] or "")[:10]
        if last_spin == today:
            raise HTTPException(400, "Daily spin already used. Come back tomorrow.")

        # Server decides the winning segment index
        winning_index = random.randint(0, len(SPIN_REWARDS) - 1)
        reward = SPIN_REWARDS[winning_index]
        new_credits = user["credits"] + reward

        con.execute(
            "UPDATE users SET credits=?, last_spin=? WHERE id=?",
            (new_credits, today, user_id)
        )
        con.execute(
            "INSERT INTO credits_history (user_id, amount, reason, timestamp) VALUES (?,?,?,?)",
            (user_id, reward, "Daily Spin", db._ts())
        )

    return {
        "status": "SUCCESS",
        "reward": reward,
        "winning_index": winning_index,
        "new_credits": new_credits,
    }

# ── History ───────────────────────────────────────────────────────────────────

@mobile_router.get("/history/{user_id}")
def get_user_history(user_id: int):
    with db._conn() as con:
        allocs = con.execute(
            "SELECT * FROM allocation_history ORDER BY id DESC LIMIT 20"
        ).fetchall()
    return {"history": [dict(a) for a in allocs]}

# ── Challenges ────────────────────────────────────────────────────────────────

CHALLENGES_REGISTRY = [
    {
        "id": "ch_pipeline",
        "title": "Run Multi-Agent Pipeline",
        "desc": "Execute end-to-end allocation (Mapping -> APRDA).",
        "reward": 30,
        "screen": "Pipeline",
    },
    {
        "id": "ch_resources",
        "title": "Analyze 3 Cloud Resources",
        "desc": "Inspect AWS EC2 or virtual node telemetry.",
        "reward": 15,
        "screen": "Resources",
    },
    {
        "id": "ch_prediction",
        "title": "Run Workload Prediction",
        "desc": "Forecast resource demand using RandomForest model.",
        "reward": 20,
        "screen": "Prediction",
    },
    {
        "id": "ch_cloudwatch",
        "title": "Inspect CloudWatch Telemetry",
        "desc": "Review CPU, memory, and packet metrics.",
        "reward": 10,
        "screen": "Resources",
    },
    {
        "id": "ch_aprda",
        "title": "Synthesize APRDA Decision",
        "desc": "Execute multi-factor scoring on workload.",
        "reward": 25,
        "screen": "APRDADecision",
    },
    {
        "id": "ch_lab",
        "title": "Complete Cloud Lab Experiment",
        "desc": "Run any interactive agent experiment in the sandbox.",
        "reward": 20,
        "screen": "CloudLab",
    },
]

@mobile_router.get("/challenges")
def get_challenges(user_id: int):
    with db._conn() as con:
        rows = con.execute(
            "SELECT challenge_id, completed, claimed FROM user_challenges WHERE user_id=?",
            (user_id,)
        ).fetchall()
        user_status = {r["challenge_id"]: dict(r) for r in rows}

    result = []
    for ch in CHALLENGES_REGISTRY:
        st = user_status.get(ch["id"])
        result.append({
            **ch,
            "completed": bool(st["completed"]) if st else True, # Default actionable/completed for demo flow
            "claimed": bool(st["claimed"]) if st else False,
        })
    return {"challenges": result}

@mobile_router.post("/challenges/claim")
def claim_challenge(user_id: int, challenge_id: str):
    target = next((c for c in CHALLENGES_REGISTRY if c["id"] == challenge_id), None)
    if not target:
        raise HTTPException(404, "Challenge not found")

    with db._conn() as con:
        user = con.execute("SELECT id, credits FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")

        existing = con.execute(
            "SELECT claimed FROM user_challenges WHERE user_id=? AND challenge_id=?",
            (user_id, challenge_id)
        ).fetchone()

        if existing and existing["claimed"] == 1:
            raise HTTPException(400, "Challenge reward already claimed")

        reward = target["reward"]
        new_credits = user["credits"] + reward

        con.execute(
            "UPDATE users SET credits=? WHERE id=?",
            (new_credits, user_id)
        )
        con.execute(
            "INSERT INTO credits_history (user_id, amount, reason, timestamp) VALUES (?,?,?,?)",
            (user_id, reward, f"Challenge: {target['title']}", db._ts())
        )
        con.execute(
            """INSERT INTO user_challenges (user_id, challenge_id, completed, claimed, claimed_at)
               VALUES (?, ?, 1, 1, ?)
               ON CONFLICT(user_id, challenge_id) DO UPDATE SET claimed=1, claimed_at=?""",
            (user_id, challenge_id, db._ts(), db._ts())
        )

    return {
        "status": "SUCCESS",
        "reward": reward,
        "new_credits": new_credits,
        "challenge_id": challenge_id,
    }

# ── Cloud Lab ─────────────────────────────────────────────────────────────────

class LabRunRequest(BaseModel):
    user_id: int
    lab_id: str

LAB_COSTS = {
    "lab_cpu_pred": 10,
    "lab_mem_pred": 10,
    "lab_mapping": 15,
    "lab_rag": 15,
    "lab_aprda": 20,
    "lab_cloudwatch": 10,
    "lab_pipeline": 25,
}

@mobile_router.post("/labs/run")
def run_lab(req: LabRunRequest):
    cost = LAB_COSTS.get(req.lab_id, 10)
    with db._conn() as con:
        user = con.execute("SELECT id, credits FROM users WHERE id=?", (req.user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")

        if user["credits"] < cost:
            raise HTTPException(400, f"Insufficient credits. Requires {cost} credits, current balance is {user['credits']}.")

        new_credits = user["credits"] - cost
        con.execute("UPDATE users SET credits=? WHERE id=?", (new_credits, req.user_id))
        con.execute(
            "INSERT INTO credits_history (user_id, amount, reason, timestamp) VALUES (?,?,?,?)",
            (req.user_id, -cost, f"Cloud Lab Experiment ({req.lab_id})", db._ts())
        )
        con.execute(
            "INSERT INTO cloud_labs (user_id, lab_id, status, timestamp) VALUES (?,?,?,?)",
            (req.user_id, req.lab_id, "COMPLETED", db._ts())
        )

    return {
        "status": "SUCCESS",
        "lab_id": req.lab_id,
        "credits_deducted": cost,
        "new_credits": new_credits,
        "timestamp": db._ts(),
    }

