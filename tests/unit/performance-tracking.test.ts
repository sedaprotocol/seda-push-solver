/**
 * Performance Tracking Test
 * Demonstrates the comprehensive performance tracking for DataRequest flow
 */

import { DataRequestPerformanceTracker, STEP_NAMES } from "../../src/core/scheduler/performance-tracker";

describe("DataRequest Performance Tracking", () => {
	let tracker: DataRequestPerformanceTracker;
	let mockLogger: { info: jest.Mock };

	beforeEach(() => {
		tracker = new DataRequestPerformanceTracker();
		mockLogger = { info: jest.fn() };
	});

	test("should track complete data request flow with detailed step timing", async () => {
		console.log("🧪 Testing DataRequest Performance Tracking");

		const taskId = "test-task-123";
		const requestNumber = 1;
		const drId = "0xabc123def456";

		// Simulate the data request flow with realistic timing
		console.log("📤 Starting DataRequest performance tracking simulation...");

		// Start tracking
		tracker.startTracking(taskId, requestNumber);

		// Step 1: Process (configuration loading)
		tracker.startStep(taskId, STEP_NAMES.PROCESS);
		await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms processing
		tracker.endStep(taskId, STEP_NAMES.PROCESS);

		// Step 2: Posting to SEDA network
		tracker.startStep(taskId, STEP_NAMES.POSTING);
		await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms posting
		tracker.endStep(taskId, STEP_NAMES.POSTING);

		// Step 3: Awaiting oracle result
		tracker.startStep(taskId, STEP_NAMES.AWAITING_ORACLE_RESULT);
		await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms oracle execution
		tracker.endStep(taskId, STEP_NAMES.AWAITING_ORACLE_RESULT);

		// Step 4: Awaiting signatures
		tracker.startStep(taskId, STEP_NAMES.AWAITING_SIGNATURES);
		await new Promise((resolve) => setTimeout(resolve, 80)); // 80ms signature fetching
		tracker.endStep(taskId, STEP_NAMES.AWAITING_SIGNATURES);

		// Step 5: Posting batch and results
		tracker.startStep(taskId, STEP_NAMES.POSTING_BATCH);
		await new Promise((resolve) => setTimeout(resolve, 30)); // 30ms EVM posting
		tracker.endStep(taskId, STEP_NAMES.POSTING_BATCH);

		// Complete the request
		tracker.completeRequest(taskId, drId);

		// Get performance data
		const performance = tracker.getRequestPerformance(taskId);
		expect(performance).toBeDefined();
		expect(performance!.taskId).toBe(taskId);
		expect(performance!.drId).toBe(drId);
		expect(performance!.status).toBe("completed");
		expect(performance!.totalDuration).toBeGreaterThan(250); // At least 260ms total

		// Verify individual steps
		const processStep = performance!.steps.get(STEP_NAMES.PROCESS);
		expect(processStep).toBeDefined();
		expect(processStep!.status).toBe("completed");
		expect(processStep!.duration).toBeGreaterThanOrEqual(10);

		const postingStep = performance!.steps.get(STEP_NAMES.POSTING);
		expect(postingStep).toBeDefined();
		expect(postingStep!.status).toBe("completed");
		expect(postingStep!.duration).toBeGreaterThanOrEqual(50);

		const oracleStep = performance!.steps.get(STEP_NAMES.AWAITING_ORACLE_RESULT);
		expect(oracleStep).toBeDefined();
		expect(oracleStep!.status).toBe("completed");
		expect(oracleStep!.duration).toBeGreaterThanOrEqual(100);

		const signaturesStep = performance!.steps.get(STEP_NAMES.AWAITING_SIGNATURES);
		expect(signaturesStep).toBeDefined();
		expect(signaturesStep!.status).toBe("completed");
		expect(signaturesStep!.duration).toBeGreaterThanOrEqual(80);

		const batchStep = performance!.steps.get(STEP_NAMES.POSTING_BATCH);
		expect(batchStep).toBeDefined();
		expect(batchStep!.status).toBe("completed");
		expect(batchStep!.duration).toBeGreaterThanOrEqual(30);

		// Log the performance summary
		tracker.logRequestPerformance(taskId, mockLogger);

		// Verify logging was called
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("🏁 DataRequest Performance Summary"));

		console.log("✅ Performance tracking simulation completed successfully");
		console.log(`   📋 Task: ${taskId}`);
		console.log(`   📊 Total Duration: ${performance!.totalDuration}ms`);
		console.log(`   🔧 Process: ${processStep!.duration}ms`);
		console.log(`   📤 Posting: ${postingStep!.duration}ms`);
		console.log(`   🔮 Oracle: ${oracleStep!.duration}ms`);
		console.log(`   ✍️  Signatures: ${signaturesStep!.duration}ms`);
		console.log(`   📦 Batch/Result: ${batchStep!.duration}ms`);
	});

	test("should calculate accurate average statistics", async () => {
		console.log("🧪 Testing Performance Statistics Calculation");

		// Simulate multiple requests with different timings
		const requests = [
			{ taskId: "task-1", drId: "dr-1", timings: { process: 15, posting: 45, oracle: 90, signatures: 60, batch: 30 } },
			{ taskId: "task-2", drId: "dr-2", timings: { process: 12, posting: 55, oracle: 110, signatures: 80, batch: 30 } },
			{ taskId: "task-3", drId: "dr-3", timings: { process: 18, posting: 40, oracle: 95, signatures: 70, batch: 25 } },
		];

		for (const [index, request] of requests.entries()) {
			tracker.startTracking(request.taskId, index + 1);

			// Process
			tracker.startStep(request.taskId, STEP_NAMES.PROCESS);
			await new Promise((resolve) => setTimeout(resolve, request.timings.process));
			tracker.endStep(request.taskId, STEP_NAMES.PROCESS);

			// Posting
			tracker.startStep(request.taskId, STEP_NAMES.POSTING);
			await new Promise((resolve) => setTimeout(resolve, request.timings.posting));
			tracker.endStep(request.taskId, STEP_NAMES.POSTING);

			// Oracle result
			tracker.startStep(request.taskId, STEP_NAMES.AWAITING_ORACLE_RESULT);
			await new Promise((resolve) => setTimeout(resolve, request.timings.oracle));
			tracker.endStep(request.taskId, STEP_NAMES.AWAITING_ORACLE_RESULT);

			// Signatures
			tracker.startStep(request.taskId, STEP_NAMES.AWAITING_SIGNATURES);
			await new Promise((resolve) => setTimeout(resolve, request.timings.signatures));
			tracker.endStep(request.taskId, STEP_NAMES.AWAITING_SIGNATURES);

			// Batch posting
			tracker.startStep(request.taskId, STEP_NAMES.POSTING_BATCH);
			await new Promise((resolve) => setTimeout(resolve, request.timings.batch));
			tracker.endStep(request.taskId, STEP_NAMES.POSTING_BATCH);

			// Complete
			tracker.completeRequest(request.taskId, request.drId);
		}

		// Calculate statistics
		const stats = tracker.getStatistics();
		expect(stats.totalRequests).toBe(3);
		expect(stats.completedRequestsCount).toBe(3);
		expect(stats.failedRequests).toBe(0);

		// Check averages (allow some tolerance for timing variations)
		const averages = stats.averages;
		expect(averages.process).toBeGreaterThanOrEqual(12);
		expect(averages.process).toBeLessThanOrEqual(20);
		expect(averages.posting).toBeGreaterThanOrEqual(40);
		expect(averages.posting).toBeLessThanOrEqual(60);
		expect(averages.awaitingOracleResult).toBeGreaterThanOrEqual(90);
		expect(averages.awaitingOracleResult).toBeLessThanOrEqual(120);
		expect(averages.awaitingSignatures).toBeGreaterThanOrEqual(60);
		expect(averages.awaitingSignatures).toBeLessThanOrEqual(90);
		expect(averages.postingBatch).toBeGreaterThanOrEqual(25);
		expect(averages.postingBatch).toBeLessThanOrEqual(35);

		// Log summary statistics
		tracker.logSummaryStatistics(mockLogger);

		// Verify summary logging
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("📊 DataRequest Performance Statistics"));

		console.log("✅ Statistics calculation test completed successfully");
		console.log(`   📊 Total Requests: ${stats.totalRequests}`);
		console.log(`   ✅ Completed: ${stats.completedRequestsCount}`);
		console.log(`   ❌ Failed: ${stats.failedRequests}`);
		console.log(`   🔧 Avg Process: ${averages.process.toFixed(1)}ms`);
		console.log(`   📤 Avg Posting: ${averages.posting.toFixed(1)}ms`);
		console.log(`   🔮 Avg Oracle: ${averages.awaitingOracleResult.toFixed(1)}ms`);
		console.log(`   ✍️  Avg Signatures: ${averages.awaitingSignatures.toFixed(1)}ms`);
		console.log(`   📦 Avg Batch: ${averages.postingBatch.toFixed(1)}ms`);
		console.log(`   🏁 Avg Total: ${averages.total.toFixed(1)}ms`);
	});

	test("should handle failed requests properly", () => {
		console.log("🧪 Testing Failed Request Handling");

		const taskId = "failed-task-456";
		const requestNumber = 1;
		const errorMessage = "Network connection failed";

		// Start tracking
		tracker.startTracking(taskId, requestNumber);

		// Start a step
		tracker.startStep(taskId, STEP_NAMES.POSTING);

		// Fail the request
		tracker.failRequest(taskId, errorMessage);

		// Verify the request is marked as failed
		const performance = tracker.getRequestPerformance(taskId);
		expect(performance).toBeDefined();
		expect(performance!.status).toBe("failed");

		// Verify the active step is also marked as failed
		const postingStep = performance!.steps.get(STEP_NAMES.POSTING);
		expect(postingStep).toBeDefined();
		expect(postingStep!.status).toBe("failed");
		expect(postingStep!.error).toBe(errorMessage);

		// Check statistics
		const stats = tracker.getStatistics();
		expect(stats.totalRequests).toBe(1);
		expect(stats.completedRequestsCount).toBe(0);
		expect(stats.failedRequests).toBe(1);

		console.log("✅ Failed request handling test completed successfully");
		console.log(`   ❌ Request Status: ${performance!.status}`);
		console.log(`   📝 Error: ${errorMessage}`);
	});

	test("should demonstrate the complete flow integration", () => {
		console.log("🧪 Testing Complete Flow Integration");

		// This test demonstrates how the performance tracker would be used
		// in the actual scheduler flow

		console.log("📋 DataRequest Flow Performance Tracking:");
		console.log("   1. 🔧 Process: Building DataRequest configuration");
		console.log("   2. 📤 Posting: Submitting to SEDA network");
		console.log("   3. ⏳ Awaiting Post: Transaction confirmation");
		console.log("   4. 🔮 Oracle Result: Waiting for oracle execution");
		console.log("   5. ✍️  Awaiting Signatures: Fetching validator signatures");
		console.log("   6. 📦 Posting Batch: Batch and results to EVM networks");

		console.log("");
		console.log("🎯 Integration Points:");
		console.log("   • TaskManager.queueTask() → startTracking()");
		console.log("   • TaskExecutor.executeTask() → step timing");
		console.log("   • Success/Failure handlers → completeRequest()/failRequest()");
		console.log("   • SchedulerCore.stop() → logSummaryStatistics()");

		console.log("");
		console.log("📊 Performance Insights:");
		console.log("   • Individual request timing breakdown");
		console.log("   • Average timing per step across all requests");
		console.log("   • Identification of bottlenecks");
		console.log("   • Success/failure rate tracking");

		console.log("✅ Complete flow integration demonstration completed");

		// Just verify the tracker is functional
		expect(tracker).toBeInstanceOf(DataRequestPerformanceTracker);
		expect(STEP_NAMES.PROCESS).toBe("process");
		expect(STEP_NAMES.POSTING).toBe("posting");
		expect(STEP_NAMES.AWAITING_ORACLE_RESULT).toBe("awaitingOracleResult");
	});
});

console.log("🎉 DataRequest Performance Tracking tests completed!");
