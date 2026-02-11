# Platform Integration Tests

Comprehensive integration tests for Domia's multi-platform support (Web and Electron).

## 🏗️ Test Architecture

### Framework Stack (Industry Standards)

**Test Runner**: Vitest
- ✅ Modern, fast, TypeScript-first
- ✅ Built-in TypeScript support
- ✅ Compatible with Vite ecosystem
- ✅ Industry standard for modern web projects

**Test Execution**: Domia Agent
- ✅ Dogfooding - tests use the product itself
- ✅ End-to-end validation of entire system
- ✅ Real-world usage scenarios
- ✅ Validates multi-platform architecture

**Automation Engine**: Playwright
- ✅ Native Electron support via CDP
- ✅ Used by Microsoft, VSCode team
- ✅ Best-in-class browser automation
- ✅ Already integrated in Domia

### Alternative Frameworks Considered

❌ **Spectron** - Deprecated, no longer maintained  
⚠️ **WebDriver.io** - Good but adds complexity  
⚠️ **Selenium** - Legacy, not optimized for modern apps

## 📋 Test Cases

### Test A: Web Platform (google.com)

**Purpose**: Validate web application interaction

**Configuration**:
- Platform: Web
- URL: https://www.google.com
- Prompt: "make sure that the search button appears"
- Max Steps: 3
- Headless: true

**Validates**:
- Web platform configuration
- URL navigation
- Element perception (search button)
- Step efficiency (≤3 steps)

**Success Criteria**:
- ✅ Test completes successfully
- ✅ Search button detected
- ✅ Completed within 3 steps
- ✅ No errors thrown

### Test B1: Electron Platform (CDP Mode)

**Purpose**: Validate Electron app interaction via Chrome DevTools Protocol

**Configuration**:
- Platform: Electron
- Connection: CDP (localhost:9222)
- Target: Domia App (or any Electron app)
- Prompt: "make sure we have the button start agent appearing"
- Max Steps: 5
- Window Title: "Auto-QA" (optional)

**Prerequisites**:
- Electron app running with `--remote-debugging-port=9222`
- For Domia app: `npm run dev` in another terminal

**Validates**:
- Electron platform configuration
- CDP connection mode
- Element detection in Electron apps
- Multi-window support (if applicable)

**Success Criteria**:
- ✅ Connects to CDP endpoint
- ✅ Finds target window
- ✅ Detects "Start Agent" button
- ✅ Completed within 5 steps

### Test B2: Electron Platform (Executable Mode)

**Purpose**: Validate Electron app launch from executable path

**Configuration**:
- Platform: Electron
- Connection: Executable
- Executable Path: `./release/mac/Auto-QA.app/Contents/MacOS/Auto-QA`
- Launch Args: `['--remote-debugging-port=9222']`
- Prompt: "make sure we have the button start agent appearing"
- Max Steps: 5

**Prerequisites**:
- Built Electron app: `npm run build`
- Executable exists in release directory

**Validates**:
- Electron platform configuration
- Executable connection mode
- App launch and connection
- CDP initialization

**Success Criteria**:
- ✅ Launches app successfully
- ✅ Connects via CDP
- ✅ Detects "Start Agent" button
- ✅ Completed within 5 steps

## 🚀 Running Tests

### Quick Start

```bash
# Set API key (required)
export GOOGLE_API_KEY=your-api-key

# Run all platform tests
npm run test:platforms

# Run specific platform
npm run test:platforms -- web
npm run test:platforms -- electron

# Watch mode
npm run test:platforms -- --watch

# Verbose output
npm run test:platforms -- --verbose
```

### Prerequisites

**All Tests**:
- ✅ `GOOGLE_API_KEY` environment variable set
- ✅ Node.js dependencies installed (`npm install`)

**Web Tests** (Test A):
- ✅ No additional setup needed
- ✅ Internet connection required

**Electron CDP Tests** (Test B1):
- ✅ Electron app running with CDP enabled:
  ```bash
  # Terminal 1: Start dev server
  npm run dev
  
  # Terminal 2: Run tests
  npm run test:platforms -- electron
  ```

**Electron Executable Tests** (Test B2):
- ✅ Build the application first:
  ```bash
  npm run build
  ```
- ✅ Check release directory for executable

### Alternative: Direct Vitest

```bash
# Run with vitest directly
npm run test:integration -- tests/integration/platform-tests/web-platform.integration.test.ts

# Run specific test file
npx vitest run --config vitest.integration.config.ts tests/integration/platform-tests/electron-platform.integration.test.ts
```

## 📁 Test Structure

```
tests/
├── integration/
│   ├── platform-tests/
│   │   ├── web-platform.integration.test.ts       # Test A
│   │   └── electron-platform.integration.test.ts   # Tests B1 & B2
│   ├── helpers/
│   │   └── test-helpers.ts                         # Shared utilities
│   ├── run-platform-tests.ts                       # CLI test runner
│   └── RunTestUseCase.integration.test.ts          # Legacy test
└── ...
```

### Test Files

**web-platform.integration.test.ts**
- Google.com search button detection
- Vision mode variant
- Simple navigation test (example.com)

**electron-platform.integration.test.ts**
- CDP mode: Connect to running app
- Executable mode: Launch and connect
- Generic app test (works with any Electron app)
- Multi-window scenario tests

**test-helpers.ts**
- `executeAgentTest()` - Run agent with config
- `verifyTestSuccess()` - Validate results
- `logTestExecution()` - Pretty printing
- `isPortOpen()` - Check CDP availability
- `getElectronAppPath()` - Platform-specific paths

## 🔧 Configuration

### Environment Variables

```bash
# Required
export GOOGLE_API_KEY=your-api-key

# Optional: Custom Electron app path for testing
export TEST_ELECTRON_APP_PATH=/path/to/your-app.app
```

### Vitest Configuration

Tests use `vitest.integration.config.ts`:
- Timeout: 120 seconds (2 minutes)
- Globals: Enabled
- Pattern: `**/*.integration.test.ts`

### Test Options

Each test accepts options:
```typescript
{
    headless: true,        // Browser headless mode (Web only)
    maxSteps: 5,           // Maximum agent steps
    vision: false,         // Enable vision LLM mode
    debugScreenshots: false // Save debug screenshots
}
```

## 📊 Test Output

### Success Example

```
🧪 Running Test A: Web Platform (Google.com)
   Platform: Web
   URL: google.com
   Objective: Detect search button
   Max Steps: 3

📊 Test: Google Search Button Detection
   Status: ✅ PASS
   Steps: 2
   Duration: 8432ms
   Events: 5
      1. started
      2. step
      3. step
      4. completed
      5. cleanup

✅ Test "Google Search Button Detection" passed in 2/3 steps (8432ms)
```

### Failure Example

```
🧪 Running Test B1: Electron Platform (CDP Mode)

⚠️  Skipping CDP test: No Electron app running on port 9222
   To run this test:
   1. Start Domia app: npm run dev
   2. Or launch built app with: your-app --remote-debugging-port=9222
```

## 🐛 Troubleshooting

### API Key Issues

**Problem**: Tests skipped with "GOOGLE_API_KEY not set"

**Solution**:
```bash
export GOOGLE_API_KEY=your-key-here
# Or add to .env file
echo "GOOGLE_API_KEY=your-key" >> .env
```

### Electron CDP Not Available

**Problem**: "No Electron app running on port 9222"

**Solution**:
```bash
# Start development server
npm run dev

# Or manually launch with CDP:
./release/mac/Auto-QA.app/Contents/MacOS/Auto-QA --remote-debugging-port=9222
```

### Executable Not Found

**Problem**: "App not built" or executable path doesn't exist

**Solution**:
```bash
# Build the application
npm run build

# Check release directory
ls -la release/
```

### Tests Timeout

**Problem**: Tests hang or timeout after 2 minutes

**Possible Causes**:
- Slow network connection (web tests)
- LLM API rate limiting
- Element not found (prompt too specific)
- App not responsive

**Solutions**:
- Check internet connection
- Verify API key is valid
- Simplify test prompts
- Increase `maxSteps` in test options

## 🎯 Best Practices

### Writing New Tests

1. **Use Test Helpers**: Leverage `executeAgentTest()` for consistency
2. **Set Realistic Step Limits**: Balance thoroughness vs efficiency
3. **Handle Prerequisites**: Check requirements before running
4. **Log Execution Details**: Use `logTestExecution()` for debugging
5. **Test Both Modes**: Validate CDP and Executable when applicable

### Example Test Template

```typescript
it('should achieve test objective', async () => {
    if (!isSetupComplete) {
        console.log('⏭️  Test skipped: Setup incomplete');
        return;
    }

    const platformConfig: WebPlatformConfig = {
        platform: 'web',
        url: 'https://example.com',
        prompt: 'verify specific behavior'
    };

    const result = await executeAgentTest(platformConfig, {
        headless: true,
        maxSteps: 3
    });

    logTestExecution(result, 'Test Name');
    verifyTestSuccess(result, 3, 'Test Name');

    expect(result.success).toBe(true);
}, 120000);
```

## 📈 CI/CD Integration

### GitHub Actions Example

```yaml
name: Platform Tests

on: [push, pull_request]

jobs:
  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:platforms -- web
        env:
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}

  test-electron:
    runs-on: macos-latest  # macOS for Electron builds
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npm run test:platforms -- electron
        env:
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
```

## 📝 Notes

- Tests are **local only** due to API key requirements
- Not designed for headless CI/CD (yet)
- Electron tests require GUI environment
- Tests validate real-world usage scenarios
- Use for development and pre-release validation

## 🔗 Related Documentation

- [Electron Driver Example](../../docs/examples/electron-driver-example.ts)
- [Platform Configuration](../../src/domain/types/PlatformConfig.ts)
- [AppDriverFactory](../../src/infrastructure/adapters/drivers/AppDriverFactory.ts)
- [RunTestUseCase](../../src/application/use-cases/RunTestUseCase.ts)
