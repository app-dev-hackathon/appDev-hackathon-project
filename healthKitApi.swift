import Foundation
import HealthKit
import CryptoKit

/// HealthKit Manager with built-in anti-cheating mechanisms
@MainActor
class HealthKitManager: ObservableObject {
    static let shared = HealthKitManager()
    private let healthStore = HKHealthStore()
    
    // Private key for signing data (store securely in Keychain in production)
    private let signingKey: String
    
    @Published var isAuthorized = false
    @Published var errorMessage: String?
    
    private init() {
        // In production, retrieve this from Keychain
        self.signingKey = UUID().uuidString
    }
    
    // MARK: - Authorization
    
    func requestAuthorization() async throws -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitError.notAvailable
        }
        
        let typesToRead: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.workoutType()
        ]
        
        try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
        isAuthorized = true
        return true
    }
    
    // MARK: - Secure Data Fetching with Anti-Cheating
    
    /// Fetches verified health data with cryptographic signature
    func fetchVerifiedHealthData(for date: Date = Date()) async throws -> VerifiedHealthData {
        // Fetch multiple data points for cross-validation
        let steps = try await fetchSteps(for: date)
        let calories = try await fetchCalories(for: date)
        let distance = try await fetchDistance(for: date)
        let workouts = try await fetchWorkouts(for: date)
        let heartRateReadings = try await fetchHeartRateReadings(for: date)
        
        // Create raw data object
        let rawData = RawHealthData(
            date: date,
            steps: steps,
            calories: calories,
            distance: distance,
            workouts: workouts,
            heartRateReadings: heartRateReadings,
            deviceInfo: getDeviceInfo(),
            timestamp: Date()
        )
        
        // Validate data consistency
        try validateDataConsistency(rawData)
        
        // Create verified data with signature
        let verifiedData = try createVerifiedData(from: rawData)
        
        return verifiedData
    }
    
    // MARK: - Individual Data Fetchers
    
    private func fetchSteps(for date: Date) async throws -> Double {
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        let samples = try await fetchSamples(for: stepType, on: date)
        
        // Sum all step samples for the day
        let totalSteps = samples.reduce(0.0) { sum, sample in
            sum + sample.quantity.doubleValue(for: HKUnit.count())
        }
        
        return totalSteps
    }
    
    private func fetchCalories(for date: Date) async throws -> Double {
        let calorieType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
        let samples = try await fetchSamples(for: calorieType, on: date)
        
        let totalCalories = samples.reduce(0.0) { sum, sample in
            sum + sample.quantity.doubleValue(for: HKUnit.kilocalorie())
        }
        
        return totalCalories
    }
    
    private func fetchDistance(for date: Date) async throws -> Double {
        let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!
        let samples = try await fetchSamples(for: distanceType, on: date)
        
        let totalDistance = samples.reduce(0.0) { sum, sample in
            sum + sample.quantity.doubleValue(for: HKUnit.meter())
        }
        
        return totalDistance
    }
    
    private func fetchWorkouts(for date: Date) async throws -> [WorkoutData] {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        
        let datePredicate = HKQuery.predicateForSamples(
            withStart: startOfDay,
            end: endOfDay,
            options: .strictStartDate
        )
        
        let workoutPredicate = HKSamplePredicate.workout(datePredicate)
        
        let descriptor = HKSampleQueryDescriptor(
            predicates: [workoutPredicate],
            sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)]
        )
        
        let workouts = try await descriptor.result(for: healthStore)
        
        return workouts.map { workout in
            WorkoutData(
                type: workout.workoutActivityType.rawValue,
                duration: workout.duration,
                calories: workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0,
                distance: workout.totalDistance?.doubleValue(for: .meter()) ?? 0,
                startDate: workout.startDate,
                endDate: workout.endDate,
                source: workout.sourceRevision.source.bundleIdentifier
            )
        }
    }
    
    private func fetchHeartRateReadings(for date: Date) async throws -> [HeartRateReading] {
        let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
        let samples = try await fetchSamples(for: heartRateType, on: date)
        
        return samples.map { sample in
            HeartRateReading(
                bpm: sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())),
                timestamp: sample.startDate
            )
        }
    }
    
    // MARK: - Generic Sample Fetcher
    
    private func fetchSamples(for type: HKQuantityType, on date: Date) async throws -> [HKQuantitySample] {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        
        let predicate = HKQuery.predicateForSamples(
            withStart: startOfDay,
            end: endOfDay,
            options: .strictStartDate
        )
        
        let samplePredicate = HKSamplePredicate.quantitySample(
            type: type,
            predicate: predicate
        )
        
        let descriptor = HKSampleQueryDescriptor(
            predicates: [samplePredicate],
            sortDescriptors: [SortDescriptor(\.startDate, order: .forward)]
        )
        
        return try await descriptor.result(for: healthStore)
    }
    
    // MARK: - Anti-Cheating Validation
    
    private func validateDataConsistency(_ data: RawHealthData) throws {
        // 1. Validate steps vs distance correlation
        // Rough estimate: 1 step ≈ 0.7-0.8 meters
        let expectedDistance = data.steps * 0.75
        let distanceVariance = abs(data.distance - expectedDistance) / expectedDistance
        
        if data.steps > 1000 && distanceVariance > 0.5 {
            throw HealthKitError.inconsistentData("Steps and distance don't correlate")
        }
        
        // 2. Validate calories vs activity
        // Basic validation: calories should relate to steps and workouts
        let workoutCalories = data.workouts.reduce(0.0) { $0 + $1.calories }
        if data.calories > 0 && workoutCalories == 0 && data.steps < 100 {
            throw HealthKitError.inconsistentData("Calories burned without activity")
        }
        
        // 3. Validate workout data
        for workout in data.workouts {
            // Ensure workout duration makes sense
            if workout.duration > 86400 { // More than 24 hours
                throw HealthKitError.inconsistentData("Workout duration exceeds 24 hours")
            }
            
            // Ensure workout is not in the future
            if workout.startDate > Date() {
                throw HealthKitError.inconsistentData("Workout in the future")
            }
        }
        
        // 4. Validate heart rate readings
        for reading in data.heartRateReadings {
            // Normal resting heart rate: 40-100 bpm
            // Max during exercise: ~220 - age (assuming age 20-80)
            if reading.bpm < 30 || reading.bpm > 250 {
                throw HealthKitError.inconsistentData("Heart rate outside realistic range")
            }
        }
        
        // 5. Check for impossibly high values
        if data.steps > 100000 { // > 100k steps per day is suspicious
            throw HealthKitError.inconsistentData("Unrealistic step count")
        }
        
        if data.calories > 10000 { // > 10k calories is extremely rare
            throw HealthKitError.inconsistentData("Unrealistic calorie burn")
        }
    }
    
    // MARK: - Cryptographic Signing
    
    private func createVerifiedData(from rawData: RawHealthData) throws -> VerifiedHealthData {
        // Serialize data
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let jsonData = try encoder.encode(rawData)
        
        // Create signature using HMAC
        let key = SymmetricKey(data: Data(signingKey.utf8))
        let signature = HMAC<SHA256>.authenticationCode(for: jsonData, using: key)
        let signatureString = Data(signature).base64EncodedString()
        
        return VerifiedHealthData(
            rawData: rawData,
            signature: signatureString,
            version: "1.0"
        )
    }
    
    // MARK: - Device Info
    
    private func getDeviceInfo() -> DeviceInfo {
        DeviceInfo(
            model: UIDevice.current.model,
            systemVersion: UIDevice.current.systemVersion,
            identifierForVendor: UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
        )
    }
}

// MARK: - Data Models

struct RawHealthData: Codable {
    let date: Date
    let steps: Double
    let calories: Double
    let distance: Double
    let workouts: [WorkoutData]
    let heartRateReadings: [HeartRateReading]
    let deviceInfo: DeviceInfo
    let timestamp: Date
}

struct WorkoutData: Codable {
    let type: UInt
    let duration: TimeInterval
    let calories: Double
    let distance: Double
    let startDate: Date
    let endDate: Date
    let source: String
}

struct HeartRateReading: Codable {
    let bpm: Double
    let timestamp: Date
}

struct DeviceInfo: Codable {
    let model: String
    let systemVersion: String
    let identifierForVendor: String
}

struct VerifiedHealthData: Codable {
    let rawData: RawHealthData
    let signature: String
    let version: String
}

// MARK: - Errors

enum HealthKitError: LocalizedError {
    case notAvailable
    case inconsistentData(String)
    case unauthorized
    
    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "HealthKit is not available on this device"
        case .inconsistentData(let reason):
            return "Data validation failed: \(reason)"
        case .unauthorized:
            return "HealthKit access not authorized"
        }
    }
}