from fastapi import FastAPI, HTTPException, Depends, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import bcrypt
import jwt
import os
import random
import string
import certifi
from dotenv import load_dotenv

# ==================== LOAD ENVIRONMENT ====================

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
SECRET_KEY = os.getenv("SECRET_KEY", "fantasy-life-league-secret-key-2025")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# ==================== FASTAPI APP & CORS ====================

app = FastAPI(
    title="Fantasy Life League API",
    version="2.0.0",
    description="Backend for Fantasy Life League (habits + leagues)",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== MONGODB CONNECTION ====================

try:
    client = MongoClient(
        MONGO_URI,
        server_api=ServerApi("1"),
        tlsCAFile=certifi.where()
    )
    client.admin.command("ping")
    print("✅ Successfully connected to MongoDB!")
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    raise

db = client["fantasy_life_league"]
users_collection = db["users"]
leagues_collection = db["leagues"]
habit_entries_collection = db["habit_entries"]

users_collection.create_index("email", unique=True)

security = HTTPBearer()

# ==================== UTILITY FUNCTIONS ====================

def convert_objectids(obj: Any) -> Any:
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, list):
        return [convert_objectids(item) for item in obj]
    if isinstance(obj, dict):
        return {key: convert_objectids(value) for key, value in obj.items()}
    return obj


def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return doc
    doc = convert_objectids(doc)
    if "password_hash" in doc:
        del doc["password_hash"]
    return doc


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
        return user_id
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def get_current_user_doc(user_id: str) -> Dict[str, Any]:
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user

# ==================== DATA MODELS ====================

class HabitGoal(BaseModel):
    sleep: Optional[float] = 8.0
    study: Optional[float] = 2.0
    exercise: Optional[float] = 1.0
    hydration: Optional[int] = 8
    nutrition: Optional[int] = 1


class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserIn(UserBase):
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserDB(UserBase):
    id: str = Field(alias="_id")
    goals: HabitGoal = HabitGoal()
    league_id: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class HabitEntryIn(BaseModel):
    sleep: Optional[float] = None
    study: Optional[float] = None
    exercise: Optional[float] = None
    hydration: Optional[int] = None
    nutrition: Optional[int] = None
    mindfulness: Optional[int] = None


class HabitEntryOut(HabitEntryIn):
    date: str
    points: Dict[str, float]
    total_points: float


class LeagueIn(BaseModel):
    name: str


class LeagueJoin(BaseModel):
    code: str

# ==================== SCORING LOGIC ====================

MAX_POINTS_PER_CATEGORY = 10.0

def calculate_score(entry: Dict[str, Any], goals: Dict[str, Any]) -> Dict[str, float]:
    points: Dict[str, float] = {}

    for category, value in entry.items():
        if value is None:
            points[category] = 0.0
            continue

        if category in goals:
            goal = goals.get(category)
            if goal and goal > 0:
                ratio = min(value / goal, 1.5)
                points[category] = round(ratio * MAX_POINTS_PER_CATEGORY, 1)
            elif category == "nutrition":
                points[category] = MAX_POINTS_PER_CATEGORY if value >= 1 else 0.0
            else:
                points[category] = 0.0
        else:
            points[category] = 0.0

    return points

# ==================== AUTH ENDPOINTS ====================

@app.post("/auth/signup", response_model=Token)
async def register_user(user_in: UserIn):
    if users_collection.find_one({"email": user_in.email}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    hashed_password = bcrypt.hashpw(user_in.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    new_user = {
        "name": user_in.name,
        "email": user_in.email,
        "password_hash": hashed_password,
        "goals": HabitGoal().dict(),
        "league_id": None,
        "created_at": datetime.utcnow(),
    }
    result = users_collection.insert_one(new_user)

    access_token = create_access_token(data={"user_id": str(result.inserted_id)})
    return {"access_token": access_token}


@app.post("/auth/login", response_model=Token)
async def login_user(user_in: LoginIn):
    user = users_collection.find_one({"email": user_in.email})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    if not bcrypt.checkpw(user_in.password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    access_token = create_access_token(data={"user_id": str(user["_id"])})
    return {"access_token": access_token}


@app.get("/auth/me", response_model=UserDB)
async def get_current_user(user_id: str = Depends(verify_token)):
    user_doc = get_current_user_doc(user_id)
    return serialize_doc(user_doc)

# ==================== HABIT HELPERS ====================

def compute_week_summary_for_user(user_id: str) -> Dict[str, Any]:
    today = datetime.now()
    start_of_week = today - timedelta(days=today.weekday())
    start_date_str = start_of_week.strftime("%Y-%m-%d")
    week_number = today.isocalendar()[1]

    entries = list(
        habit_entries_collection.find(
            {"user_id": ObjectId(user_id), "date": {"$gte": start_date_str}}
        )
    )

    if not entries:
        return {
            "week": week_number,
            "score": {
                "days_logged": 0,
                "total": 0.0,
                "categories": {},
            },
        }

    total_points = 0.0
    category_totals: Dict[str, float] = {}
    days_logged = len(entries)

    for entry in entries:
        total_points += entry.get("total_points", 0.0)
        for cat, pts in entry.get("points", {}).items():
            category_totals[cat] = category_totals.get(cat, 0.0) + pts

    return {
        "week": week_number,
        "score": {
            "days_logged": days_logged,
            "total": round(total_points, 1),
            "categories": {k: round(v, 1) for k, v in category_totals.items()},
        },
    }

# ==================== HABIT ENDPOINTS ====================

@app.post("/habits/log", response_model=HabitEntryOut)
async def log_habit_entry(entry_in: HabitEntryIn, user_id: str = Depends(verify_token)):
    user = get_current_user_doc(user_id)
    today = datetime.now().strftime("%Y-%m-%d")

    entry_data = entry_in.dict(exclude_none=True)
    points = calculate_score(entry_data, user.get("goals", {}))
    total_points = sum(points.values())

    week_number = datetime.now().isocalendar()[1]
    year = datetime.now().year

    new_entry = {
        "user_id": ObjectId(user_id),
        "date": today,
        "week_number": week_number,
        "year": year,
        "entry": entry_data,
        "points": points,
        "total_points": total_points,
        "logged_at": datetime.utcnow(),
    }

    habit_entries_collection.update_one(
        {"user_id": ObjectId(user_id), "date": today},
        {"$set": new_entry},
        upsert=True,
    )

    saved_entry = habit_entries_collection.find_one({"user_id": ObjectId(user_id), "date": today})

    return {
        **saved_entry["entry"],
        "date": saved_entry["date"],
        "points": saved_entry["points"],
        "total_points": saved_entry["total_points"],
    }


@app.get("/habits/today", response_model=HabitEntryOut)
async def get_today_entry(user_id: str = Depends(verify_token)):
    today = datetime.now().strftime("%Y-%m-%d")
    entry = habit_entries_collection.find_one({"user_id": ObjectId(user_id), "date": today})

    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No entry today")

    return {
        **entry["entry"],
        "date": entry["date"],
        "points": entry["points"],
        "total_points": entry["total_points"],
    }


@app.get("/habits/week")
async def get_weekly_summary(user_id: str = Depends(verify_token)):
    return compute_week_summary_for_user(user_id)


@app.get("/habits/history")
async def get_habit_history(
    days: int = Query(30, ge=7, le=90),
    user_id: str = Depends(verify_token),
):
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    entries = list(
        habit_entries_collection.find(
            {"user_id": ObjectId(user_id), "date": {"$gte": start_date}}
        ).sort("date", 1)
    )

    history_data: List[Dict[str, Any]] = []
    date_cursor = datetime.strptime(start_date, "%Y-%m-%d").date()
    today_date = datetime.now().date()
    entry_map = {e["date"]: e for e in entries}

    while date_cursor <= today_date:
        date_str = date_cursor.strftime("%Y-%m-%d")
        data_point = {"date": date_str}

        if date_str in entry_map:
            entry = entry_map[date_str]
            data_point["sleep"] = entry["entry"].get("sleep", 0)
            data_point["study"] = entry["entry"].get("study", 0)
            data_point["total_points"] = entry.get("total_points", 0.0)
        else:
            data_point["sleep"] = 0
            data_point["study"] = 0
            data_point["total_points"] = 0.0

        history_data.append(data_point)
        date_cursor += timedelta(days=1)

    return history_data

# ==================== LEAGUE ENDPOINTS ====================

def generate_league_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


@app.post("/league/create")
async def create_league(league_in: LeagueIn, user_id: str = Depends(verify_token)):
    user = get_current_user_doc(user_id)
    if user.get("league_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in a league")

    new_code = generate_league_code()
    new_league = {
        "name": league_in.name,
        "code": new_code,
        "members": [ObjectId(user_id)],
        "created_by": ObjectId(user_id),
        "created_at": datetime.utcnow(),
    }
    result = leagues_collection.insert_one(new_league)
    league_id = str(result.inserted_id)

    users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"league_id": league_id}})

    return {"id": league_id, "name": league_in.name, "code": new_code}


@app.post("/league/join")
async def join_league(join_in: LeagueJoin, user_id: str = Depends(verify_token)):
    user = get_current_user_doc(user_id)
    if user.get("league_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in a league")

    league = leagues_collection.find_one({"code": join_in.code.upper()})
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid code")

    leagues_collection.update_one(
        {"_id": league["_id"]},
        {"$addToSet": {"members": ObjectId(user_id)}},
    )

    league_id = str(league["_id"])
    users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"league_id": league_id}})

    return {"id": league_id, "name": league["name"], "code": league["code"]}


@app.get("/league/standings")
async def get_league_standings(user_id: str = Depends(verify_token)):
    user = get_current_user_doc(user_id)
    league_id = user.get("league_id")

    if not league_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not in a league")

    league = leagues_collection.find_one({"_id": ObjectId(league_id)})
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="League not found")

    member_ids = league.get("members", [])
    members = list(users_collection.find({"_id": {"$in": member_ids}}, {"name": 1, "email": 1}))

    standings_data = []

    for member in members:
        member_id_str = str(member["_id"])
        week_summary = compute_week_summary_for_user(member_id_str)["score"]

        wins = random.randint(0, 5)
        losses = 5 - wins
        total_points = week_summary["total"] + (wins * 100 + losses * 50)

        standings_data.append(
            {
                "player_id": member_id_str,
                "name": member["name"],
                "wins": wins,
                "losses": losses,
                "total_points": round(total_points, 1),
                "current_week_score": week_summary,
            }
        )

    standings_data.sort(key=lambda x: (x["wins"], x["total_points"]), reverse=True)
    for i, player in enumerate(standings_data):
        player["rank"] = i + 1

    return convert_objectids({
        "league": league,
        "standings": standings_data,
        "member_count": len(member_ids),
    })

# ==================== ROOT ENDPOINT ====================

@app.get("/")
async def root():
    return {
        "service": "Fantasy Life League API",
        "version": "2.0.0",
        "status": "running",
        "endpoints": {
            "auth": ["/auth/signup", "/auth/login", "/auth/me"],
            "habits": ["/habits/log", "/habits/today", "/habits/week", "/habits/history"],
            "leagues": ["/league/create", "/league/join", "/league/standings"],
            "docs": "/docs",
        },
    }

# ==================== ENTRYPOINT ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
