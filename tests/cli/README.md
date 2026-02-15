# CLI Production Tests

**True end-to-end testing using the actual Domia CLI in production mode**

## 🎯 Architecture Philosophy

### The Problem with Traditional Tests
Traditional integration tests use:
- ❌ Programmatic API calls (not what users do)
- ❌ Mock dependencies (not production code)
- ❌ Test frameworks (adds complexity)
- ❌ Only tests the test code path

### Our Solution: CLI Production Testing
Our tests use:
- ✅ **Actual CLI** (`npm run cli`) that users run
- ✅ **Production code path** - exact same execution flow
- ✅ **No mocks** - real Playwright, real LLM, real drivers
- ✅ **True dogfooding** - Domia tests Domia

## 🏗️ How It Works

### Test A: Web Platform

```bash
# What the test does:
1. Starts local deterministic fixture web app
2. Spawns: npm run cli -- run --url http://127.0.0.1:<port> --prompt "..." --steps 2
3. Waits for CLI to complete
4. Parses output for success/failure
5. Validates deterministic page assertion

# This is EXACTLY what a user would run
```

### Test A2: Web Feature Suite

```bash
# What the test does:
1. Starts local deterministic fixture web app
2. Runs multiple real CLI sessions (no mocks) for feature validation:
    - deterministic assertion + history persistence
    - temporal timeline artifact emission
    - vision screenshot artifact emission
    - CLI option matrix (`--provider`, `--verbose`, `--debug`)
    - failure path (invalid URL) + recovery on next valid run
2. Waits for CLI to complete
3. Parses output for success/failure
4. Validates feature artifacts and expected pass/fail behavior

# This is EXACTLY what a user would run
```

### Test B: Electron Platform

```bash
# CDP Mode:
1. Build Domia app (if not built)
2. Launch Domia with --remote-debugging-port=9222
3. Wait for CDP endpoint to be ready
4. Spawns: npm run cli -- run [Electron CDP config]
5. CLI tests the running Domia app
6. Cleanup: Kill app process

# Executable Mode:
1. Build Domia app (if not built)
2. Spawns: npm run cli -- run [Electron Executable config]
3. CLI launches app, tests it, closes it
4. Parse results

# Domia testing Domia = TRUE DOGFOODING
```

## 📁 File Structure

```
tests/cli/
├── helpers/
│   └── cli-test-helpers.ts     # Spawn CLI, parse output, manage processes
├── web-test.ts                  # Test A: Web platform
├── web-features-test.ts         # Test A2: Web feature validation (fixture-based)
├── electron-test.ts             # Test B: Electron CDP + Executable
├── vllm-test.ts                 # Test C: vLLM provider integration (real endpoint)
├── run-cli-tests.ts             # Unified test runner
└── README.md                    # This file

package.json                     # Added: "test:cli" script
```

## 🚀 Running Tests

### Quick Start

```bash
# Set API key
export GOOGLE_API_KEY=your-key-here

# Run all CLI tests
npm run test:cli

# Run specific platform
npm run test:cli -- web
npm run test:cli -- electron
npm run test:cli -- vllm
```

### Prerequisites

**All Tests:**
- ✅ `GOOGLE_API_KEY` environment variable
- ✅ `npm install` completed

**Web Tests:**
- ✅ No additional setup (just internet)

**Electron Tests:**
- ✅ App will be built automatically if needed
- ⚠️ Takes longer due to build step (~5-10 minutes first time)

## 📊 Test Output

```
╔═══════════════════════════════════════════════════╗
║       Domia CLI Production Test Runner           ║
╚═══════════════════════════════════════════════════╝

✅ API key found

Architecture:
  ✓ Uses actual production CLI (npm run cli)
  ✓ Tests real user code paths
  ✓ No mocks or test frameworks needed
  ✓ Domia tests itself (true dogfooding)

═══════════════════════════════════════════════════════
TEST SUITE A: Web Platform
═══════════════════════════════════════════════════════

▶️  Running Test A: Web Platform...

╔═══════════════════════════════════════════════════╗
║   Test A: Web Platform - Google Search Button    ║
╚═══════════════════════════════════════════════════╝

✅ API key found
📝 Test Configuration:
   Platform: Web
   URL: google.com
   Prompt: make sure that the search button appears
   Max Steps: 3
   Headless: true

🚀 Running CLI command...

Command: npm run cli -- run --url google.com --prompt "..." --steps 3

────────────────────────────────────────────────────────

[CLI output appears here in real-time]

════════════════════════════════════════════════════════
📊 Test: Google Search Button Detection
════════════════════════════════════════════════════════
Status: ✅ PASS
Duration: 12453ms
Exit Code: 0
════════════════════════════════════════════════════════

✅ Test PASSED
✓ Completed in 12453ms
✓ Production CLI works correctly

✅ Test A: Web Platform PASSED

═══════════════════════════════════════════════════════
TEST SUITE B: Electron Platform
═══════════════════════════════════════════════════════

[Similar output for Electron tests]

════════════════════════════════════════════════════════
📊 TEST SUMMARY
════════════════════════════════════════════════════════
Web Platform        : ✅ PASS
Electron Platform   : ✅ PASS
════════════════════════════════════════════════════════

🎉 ALL TESTS PASSED!

Production CLI is working correctly
All user scenarios validated
```

## 🔍 What Each Test Validates

### Test A: Web Platform (deterministic fixture)

**Validates:**
- ✅ CLI accepts web platform configuration
- ✅ Local fixture navigation works
- ✅ Agent perceives fixture page elements
- ✅ Agent completes deterministic assertion within step limit
- ✅ CLI exits with correct code
- ✅ Entire web testing workflow

**Success Criteria:**
- Exit code 0
- Fixture button detected
- Completed within 2 steps
- No errors in output

### Test A2: Web Feature Suite (local fixture app)

**Validates:**
- ✅ Deterministic text assertion path (feature-level correctness)
- ✅ Deterministic button assertion path
- ✅ Temporal observation timeline artifact emission (`*_timeline.json`)
- ✅ Vision screenshot artifact emission (`*_screenshot.jpg`)
- ✅ CLI option-matrix behavior (`--provider`, `--verbose`, `--debug`)
- ✅ Failure-path handling on invalid URL and successful recovery on next run

**Success Criteria:**
- Exit code 0 for each scenario
- Artifacts generated when feature flags are enabled
- Temporal timeline contains at least one frame

### Test B1: Electron CDP Mode

**Validates:**
- ✅ Electron app builds correctly
- ✅ App launches with CDP enabled
- ✅ CDP endpoint responds
- ✅ CLI connects to running Electron app
- ✅ Agent perceives Electron UI elements
- ✅ Electron-specific tools work
- ✅ **Domia successfully tests itself**

**Success Criteria:**
- App launches successfully
- CDP connection established
- "Start Agent" button detected
- Completed within 5 steps
- Clean app termination

### Test B2: Electron Executable Mode

**Validates:**
- ✅ CLI launches Electron app from executable
- ✅ App initializes with launch args
- ✅ CDP auto-connection works
- ✅ Full executable workflow
- ✅ **End-to-end dogfooding**

**Success Criteria:**
- App launches from path
- Auto-connection succeeds
- Test completes successfully
- App closes cleanly

### Test C: vLLM Provider Integration (real endpoint)

**Validates:**
- ✅ CLI provider override path (`--provider vllm`) is honored
- ✅ Real vLLM endpoint processes run requests through CLI
- ✅ Runtime logs reflect selected provider

**Success Criteria:**
- CLI run exits with code 0
- Real vLLM endpoint is reachable and completes the task
- Output includes `provider=vllm`

## 🎯 Key Benefits

### 1. Production Code Testing
- Tests the EXACT code users run
- No separate test code paths
- Real CLI command execution
- Authentic user experience

### 2. True Dogfooding
- Domia Electron app tests itself
- Validates the entire system
- Builds confidence in the product
- Catches integration issues early

### 3. Simplicity
- No test frameworks (Vitest, Jest, etc.)
- No mocks or stubs
- Just spawn CLI and parse output
- Easy to understand and maintain

### 4. Reliability
- Tests real dependencies (Playwright, LLM)
- Catches actual execution errors
- Validates complete workflows
- Production-grade validation

## 🛠️ Technical Implementation

### CLI Test Helpers

```typescript
// Spawn CLI command
const result = await runCLITest({
    url: 'https://google.com',
    prompt: 'test objective',
    maxSteps: 3
});

// Parse results
if (result.success && result.exitCode === 0) {
    console.log('Test passed!');
}
```

### Process Management

```typescript
// Launch Electron app
const app = await launchElectronApp(appPath, 9222);

// Wait for CDP
await waitForCDP(9222);

// Test it
await runCLITest({ cdpUrl: 'http://localhost:9222', ... });

// Cleanup
await killElectronApp(app);
```

### Output Parsing

```typescript
// CLI output is captured
const output = result.stdout + result.stderr;

// Parse for success indicators
const success = output.includes('✓') || 
                output.includes('passed') ||
                result.exitCode === 0;

// Extract errors
const errors = extractErrors(output);
```

## 🐛 Troubleshooting

### Test Timeouts

**Symptom:** Tests hang indefinitely

**Causes:**
- CLI waiting for user input
- App didn't launch
- CDP endpoint not available

**Solutions:**
- Check CLI has no interactive prompts with config
- Verify app path is correct
- Check CDP port not in use

### Build Failures

**Symptom:** "Electron app not built" or build fails

**Solutions:**
```bash
# Manual build
npm run build

# Check release directory
ls -la release/

# Clean and rebuild
rm -rf release/ dist/ dist-electron/
npm run build
```

### API Key Issues

**Symptom:** "GOOGLE_API_KEY not set"

**Solutions:**
```bash
# Set environment variable
export GOOGLE_API_KEY=your-key

# Or add to .env
echo "GOOGLE_API_KEY=your-key" >> .env

# Verify
echo $GOOGLE_API_KEY
```

## 📈 Comparison with Integration Tests

| Aspect | Integration Tests | CLI Production Tests |
|--------|------------------|---------------------|
| **Code Path** | Programmatic API | Real CLI commands |
| **Dependencies** | Mocked | Real (Playwright, LLM) |
| **User Experience** | Simulated | Authentic |
| **Complexity** | High (Vitest, mocks) | Low (spawn + parse) |
| **Dogfooding** | Partial | Complete |
| **Speed** | Fast | Medium (real execution) |
| **Confidence** | Medium | High |
| **Best For** | Unit/integration | End-to-end validation |

## 🎓 Best Practices

### Writing New CLI Tests

1. **Use Real Commands**: Spawn actual CLI, don't call functions
2. **Parse Output**: Look for success indicators in stdout
3. **Handle Timeouts**: Set reasonable timeouts for operations
4. **Clean Up**: Always kill processes in finally blocks
5. **Log Everything**: Echo CLI output for debugging

### Example Test Template

```typescript
async function testScenario() {
    console.log('Starting test...');
    
    // Run CLI
    const result = await runCLITest({
        url: 'https://example.com',
        prompt: 'verify something',
        maxSteps: 5
    });
    
    // Validate
    logTestResult('Test Name', result);
    
    if (!result.success) {
        console.error('Test failed:', result.errors);
        process.exit(1);
    }
    
    console.log('Test passed!');
    process.exit(0);
}
```

## 🚀 Future Enhancements

- [ ] Add JSON output parsing for structured results
- [ ] Implement test result caching
- [ ] Add performance benchmarks
- [ ] Create CI/CD pipeline examples
- [ ] Add screenshot diff validation
- [ ] Implement parallel test execution
- [ ] Add test result HTML reports

## 📝 Notes

- **Local Only**: These tests require API keys and built apps
- **Long Running**: Electron tests take 5-10 minutes due to build
- **True E2E**: Tests the entire system including CLI, drivers, LLM
- **Production Ready**: Validates actual user workflows

## 🔗 Related Documentation

- [Integration Tests](../integration/platform-tests/README.md) - Programmatic API tests
- [CLI Documentation](../../src/cli/README.md) - CLI usage and options
- [Platform Configuration](../../src/domain/types/PlatformConfig.ts) - Config types

---

**Testing Approach**: CLI Production Testing  
**Framework**: None (simple Node.js spawn)  
**Coverage**: Web + Electron (CDP + Executable)  
**Dogfooding**: Complete (Domia tests Domia)  
**Status**: ✅ Production Ready
