"""
Backend API for Fantasy Life League - HealthKit Integration
Verifies health data from iOS app to prevent cheating
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
from typing import List, Optional
from datetime import datetime, timedelta
import hmac
import hashlib
import json
from enum import Enum
import numpy as np

app = FastAPI(title="Fantasy Life League - Health API")
security = HTTPBearer()

# MARK: - Data Models

class DeviceInfo(BaseModel):
    model: str
    systemVersion: str
    identifierForVendor: str

class HeartRateReading(BaseModel):
    bpm: float
    timestamp: datetime

class WorkoutData(BaseModel):
    type: int
    duration: float
    calories: float
    distance: float
    startDate: datetime
    endDate: datetime
    source: str

class RawHealthData(BaseModel):
    date: datetime
    steps: float
    calories: float
    distance: float
    workouts: List[WorkoutData]
    heartRateReadings: List[HeartRateReading]
    deviceInfo: DeviceInfo
    timestamp: datetime
    
    @validator('steps')
    def validate_steps(cls, v):
        if v < 0 or v > 100000:
            raise ValueError('Steps must be between 0 and 100,000')
        return v
    
    @validator('calories')
    def validate_calories(cls, v):
        if v < 0 or v > 10000:
            raise ValueError('Calories must be between 0 and 10,000')
        return v

class VerifiedHealthData(BaseModel):
    rawData: RawHealthData
    signature: str
    version: str

class HealthDataSubmission(BaseModel):
    userId: str
    data: VerifiedHealthData

class ValidationResult(BaseModel):
    isValid: bool
    score: int
    warnings: List[str]
    errors: List[str]

# MARK: - Anti-Cheating Configuration

class CheatDetectionConfig:
    # Maximum realistic values
    MAX_STEPS_PER_DAY = 100000
    MAX_CALORIES_PER_DAY = 10000
    MAX_DISTANCE_METERS = 100000  # ~100km
    
    # Correlation thresholds
    STEP_TO_DISTANCE_RATIO = 0.75  # meters per step
    STEP_DISTANCE_VARIANCE_THRESHOLD = 0.5
    
    # Time-based checks
    MAX_SUBMISSION_AGE_HOURS = 2
    MIN_SUBMISSION_INTERVAL_MINUTES = 5
    
    # Anomaly detection
    ENABLE_STATISTICAL_ANALYSIS = True
    Z_SCORE_THRESHOLD = 3.0  # Standard deviations from mean

# MARK: - In-Memory Storage (Replace with Redis/Database in production)

user_submission_history = {}
user_statistics = {}

# MARK: - Cryptographic Verification

def verify_signature(data: VerifiedHealthData, signing_key: str) -> bool:
    """
    Verify the HMAC signature of the health data
    """
    try:
        # Recreate the signature
        raw_data_dict = data.rawData.dict()
        json_data = json.dumps(raw_data_dict, sort_keys=True, default=str)
        
        expected_signature = hmac.new(
            signing_key.encode(),
            json_data.encode(),
            hashlib.sha256
        ).hexdigest()
        
        # Compare signatures (constant-time comparison)
        return hmac.compare_digest(data.signature, expected_signature)
    except Exception as e:
        print(f"Signature verification error: {e}")
        return False

# MARK: - Anti-Cheating Validators

class HealthDataValidator:
    
    @staticmethod
    def validate_data_consistency(data: RawHealthData) -> ValidationResult:
        """
        Comprehensive validation with multiple anti-cheating checks
        """
        warnings = []
        errors = []
        score = 0
        
        # 1. Steps vs Distance Correlation
        if data.steps > 1000:
            expected_distance = data.steps * CheatDetectionConfig.STEP_TO_DISTANCE_RATIO
            distance_variance = abs(data.distance - expected_distance) / expected_distance
            
            if distance_variance > CheatDetectionConfig.STEP_DISTANCE_VARIANCE_THRESHOLD:
                warnings.append(
                    f"Steps ({data.steps:.0f}) and distance ({data.distance:.0f}m) correlation is off. "
                    f"Expected ~{expected_distance:.0f}m"
                )
            else:
                score += 20
        
        # 2. Calories vs Activity Validation
        workout_calories = sum(w.calories for w in data.workouts)
        
        if data.calories > 0:
            if workout_calories == 0 and data.steps < 100:
                errors.append("Calories burned without any recorded activity")
            else:
                score += 15
        
        # 3. Workout Validation
        for i, workout in enumerate(data.workouts):
            # Duration check
            if workout.duration > 86400:  # 24 hours
                errors.append(f"Workout {i} duration ({workout.duration/3600:.1f}h) exceeds 24 hours")
            
            # Future check
            if workout.startDate > datetime.now():
                errors.append(f"Workout {i} is scheduled in the future")
            
            # Consistency check
            if workout.endDate < workout.startDate:
                errors.append(f"Workout {i} end time is before start time")
            
            # Realistic calorie burn rate (very rough estimate)
            if workout.duration > 0:
                calories_per_minute = workout.calories / (workout.duration / 60)
                if calories_per_minute > 30:  # Very high burn rate
                    warnings.append(
                        f"Workout {i} has unusually high calorie burn rate "
                        f"({calories_per_minute:.1f} cal/min)"
                    )
        
        if len(errors) == 0 and len(data.workouts) > 0:
            score += 25
        
        # 4. Heart Rate Validation
        suspicious_hr_count = 0
        for reading in data.heartRateReadings:
            if reading.bpm < 30 or reading.bpm > 250:
                suspicious_hr_count += 1
        
        if suspicious_hr_count > 0:
            warnings.append(
                f"{suspicious_hr_count} heart rate readings outside normal range"
            )
        elif len(data.heartRateReadings) > 0:
            score += 15
        
        # 5. Timestamp Validation
        submission_age = (datetime.now() - data.timestamp).total_seconds() / 3600
        
        if submission_age > CheatDetectionConfig.MAX_SUBMISSION_AGE_HOURS:
            warnings.append(
                f"Data is {submission_age:.1f} hours old. "
                f"Recent data is more trustworthy."
            )
        else:
            score += 10
        
        # 6. Device Consistency Check
        if data.deviceInfo.identifierForVendor == "unknown":
            warnings.append("Unable to verify device identity")
        else:
            score += 15
        
        # Determine validity
        is_valid = len(errors) == 0 and score >= 50
        
        return ValidationResult(
            isValid=is_valid,
            score=score,
            warnings=warnings,
            errors=errors
        )
    
    @staticmethod
    def check_submission_rate(user_id: str, timestamp: datetime) -> bool:
        """
        Prevent rapid-fire submissions (potential bot behavior)
        """
        if user_id not in user_submission_history:
            user_submission_history[user_id] = []
        
        history = user_submission_history[user_id]
        
        # Check last submission
        if history:
            last_submission = history[-1]
            time_diff = (timestamp - last_submission).total_seconds() / 60
            
            if time_diff < CheatDetectionConfig.MIN_SUBMISSION_INTERVAL_MINUTES:
                return False
        
        # Add to history and maintain only recent submissions
        history.append(timestamp)
        user_submission_history[user_id] = history[-100:]  # Keep last 100
        
        return True
    
    @staticmethod
    def detect_statistical_anomalies(user_id: str, data: RawHealthData) -> List[str]:
        """
        Use statistical analysis to detect outliers based on user's historical data
        """
        warnings = []
        
        if not CheatDetectionConfig.ENABLE_STATISTICAL_ANALYSIS:
            return warnings
        
        if user_id not in user_statistics:
            user_statistics[user_id] = {
                'steps': [],
                'calories': [],
                'distance': []
            }
        
        stats = user_statistics[user_id]
        
        # Check if we have enough historical data
        if len(stats['steps']) >= 7:  # Need at least a week of data
            
            # Steps anomaly
            steps_mean = np.mean(stats['steps'])
            steps_std = np.std(stats['steps'])
            
            if steps_std > 0:
                steps_z_score = abs((data.steps - steps_mean) / steps_std)
                
                if steps_z_score > CheatDetectionConfig.Z_SCORE_THRESHOLD:
                    warnings.append(
                        f"Step count ({data.steps:.0f}) is {steps_z_score:.1f} "
                        f"standard deviations from your average ({steps_mean:.0f})"
                    )
            
            # Calories anomaly
            calories_mean = np.mean(stats['calories'])
            calories_std = np.std(stats['calories'])
            
            if calories_std > 0:
                calories_z_score = abs((data.calories - calories_mean) / calories_std)
                
                if calories_z_score > CheatDetectionConfig.Z_SCORE_THRESHOLD:
                    warnings.append(
                        f"Calorie burn ({data.calories:.0f}) is {calories_z_score:.1f} "
                        f"standard deviations from your average ({calories_mean:.0f})"
                    )
        
        # Update statistics (keep last 30 days)
        stats['steps'].append(data.steps)
        stats['calories'].append(data.calories)
        stats['distance'].append(data.distance)
        
        for key in stats:
            stats[key] = stats[key][-30:]
        
        user_statistics[user_id] = stats
        
        return warnings
    
    @staticmethod
    def validate_source_authenticity(data: RawHealthData) -> List[str]:
        """
        Validate that data comes from legitimate sources
        """
        warnings = []
        trusted_sources = [
            'com.apple.health',
            'com.apple.Health',
            'com.nike.nikeplus-gps',
            'com.strava.Strava',
            'com.fitbit.FitbitMobile'
        ]
        
        for workout in data.workouts:
            if workout.source not in trusted_sources:
                warnings.append(
                    f"Workout from unrecognized source: {workout.source}"
                )
        
        return warnings

# MARK: - API Endpoints

@app.post("/api/health/submit", response_model=dict)
async def submit_health_data(
    submission: HealthDataSubmission,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Submit verified health data from iOS app
    
    Returns points awarded and validation results
    """
    
    # TODO: Verify JWT token from credentials.credentials
    # For now, we'll use a simple approach
    
    data = submission.data
    user_id = submission.userId
    
    # 1. Verify cryptographic signature
    # TODO: Get user's signing key from database
    signing_key = "your-secret-key-here"  # Should be unique per user
    
    # Commented out for demo - implement proper signature verification
    # if not verify_signature(data, signing_key):
    #     raise HTTPException(status_code=403, detail="Invalid data signature")
    
    # 2. Check submission rate
    if not HealthDataValidator.check_submission_rate(user_id, data.rawData.timestamp):
        raise HTTPException(
            status_code=429,
            detail="Submissions too frequent. Please wait before submitting again."
        )
    
    # 3. Validate data consistency
    validation = HealthDataValidator.validate_data_consistency(data.rawData)
    
    if not validation.isValid:
        return {
            "accepted": False,
            "validation": validation.dict(),
            "message": "Data validation failed. Please ensure your data is accurate."
        }
    
    # 4. Check for statistical anomalies
    anomaly_warnings = HealthDataValidator.detect_statistical_anomalies(
        user_id, data.rawData
    )
    validation.warnings.extend(anomaly_warnings)
    
    # 5. Validate source authenticity
    source_warnings = HealthDataValidator.validate_source_authenticity(data.rawData)
    validation.warnings.extend(source_warnings)
    
    # 6. Calculate points based on validation score
    base_points = calculate_points(data.rawData)
    trust_multiplier = min(validation.score / 100, 1.0)
    final_points = int(base_points * trust_multiplier)
    
    # 7. Store data (implement database storage)
    # await store_health_data(user_id, data.rawData, validation)
    
    return {
        "accepted": True,
        "points": final_points,
        "validation": validation.dict(),
        "message": "Health data accepted successfully!"
    }

@app.get("/api/health/status/{user_id}")
async def get_user_health_status(user_id: str):
    """
    Get user's health data statistics and validation history
    """
    
    stats = user_statistics.get(user_id, {})
    
    if not stats or not stats.get('steps'):
        return {
            "hasData": False,
            "message": "No health data available yet"
        }
    
    return {
        "hasData": True,
        "statistics": {
            "averageSteps": np.mean(stats['steps']) if stats['steps'] else 0,
            "averageCalories": np.mean(stats['calories']) if stats['calories'] else 0,
            "averageDistance": np.mean(stats['distance']) if stats['distance'] else 0,
            "daysTracked": len(stats['steps'])
        }
    }

# MARK: - Helper Functions

def calculate_points(data: RawHealthData) -> int:
    """
    Calculate points based on health activity
    Customize this based on your Fantasy Life League rules
    """
    points = 0
    
    # Steps points (1 point per 1000 steps)
    points += int(data.steps / 1000)
    
    # Workout points (10 points per workout)
    points += len(data.workouts) * 10
    
    # Workout duration points (1 point per 5 minutes)
    total_workout_time = sum(w.duration for w in data.workouts) / 60
    points += int(total_workout_time / 5)
    
    # Calorie points (1 point per 100 calories)
    points += int(data.calories / 100)
    
    # Distance points (1 point per km)
    points += int(data.distance / 1000)
    
    # Bonus for consistency
    if data.steps > 8000 and len(data.workouts) > 0:
        points += 50  # Consistency bonus
    
    return points

@app.get("/")
async def root():
    return {
        "service": "Fantasy Life League - Health API",
        "version": "1.0",
        "status": "running"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)