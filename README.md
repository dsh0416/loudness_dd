# Loudness DD

<p align="center">
  <strong>📊 LUFS-based Tab Volume Balancer for Chrome</strong>
</p>

<p align="center">
  A Chrome extension that automatically balances audio levels across browser tabs using professional broadcast-standard LUFS measurement.
</p>

<p align="center">
  For autonomous coding agents and contributors, see <a href="./AGENT.md"><strong>AGENT.md</strong></a>.
</p>

---

## ✨ Features

### Real-time LUFS Metering
- **ITU-R BS.1770-4 compliant** loudness measurement
- K-weighted filtering for perceptual accuracy
- Displays momentary, short-term, and integrated loudness
- Visual loudness meters with color-coded level indicators

### Auto Volume Balancing
- **One-shot balance**: Instantly normalize all tabs to your target LUFS
- **Continuous auto-balance**: Keep tabs balanced in real-time as content changes
- Supports multiple target presets:
  - 📺 **Broadcast** (-24 LUFS)
  - 🎧 **Streaming** (-14 LUFS)
  - 🎙️ **Podcast** (-16 LUFS)
  - 🔊 **Loud** (-9 LUFS)

### Output Limiter
- Prevents clipping when multiple loud sources play simultaneously
- Configurable ceiling threshold (-6 dB to -0.1 dB)
- Advanced controls: Attack, Release, and Knee parameters
- Protects your ears and speakers from unexpected volume spikes

### Tab Management
- Register and monitor multiple tabs simultaneously
- Per-tab volume control with mute/unmute
- Visual indicators for active captures
- Clean, modern dark UI optimized for quick adjustments

## 🛠️ Tech Stack

- **Vue 3** with Composition API
- **TypeScript** for type safety
- **Pinia** for state management
- **Vite** + **CRXJS** for Chrome extension development
- **Web Audio API** for real-time audio processing
- **Chrome Extension Manifest V3**

## 📦 Installation

### From Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/dsh0416/loudness_dd.git
   cd loudness_dd
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Build the extension**
   ```bash
   pnpm build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Development

```bash
# Start dev server with hot reload
pnpm dev

# Run unit tests
pnpm test:unit

# Run e2e tests
pnpm test:e2e

# Lint and format
pnpm lint
pnpm format

# Type checking
pnpm type-check
```

## 🎯 Usage

1. **Click the extension icon** to open the popup
2. **Navigate to a tab** with audio content (YouTube, Spotify, etc.)
3. **Click "Register Current Tab"** to start capturing audio
4. **Repeat** for other tabs you want to monitor
5. **Adjust the target LUFS** using the slider or presets
6. **Click "Balance Now"** for one-time normalization, or **"Auto Balance"** for continuous adjustment

## 📐 How It Works

### LUFS Measurement
The extension implements the ITU-R BS.1770-4 algorithm:

1. **K-weighting Filter**: Two-stage biquad filter (high-shelf + high-pass) that models human frequency perception
2. **Block Processing**: 400ms overlapping blocks with 75% overlap for smooth measurements
3. **Gating**: Excludes quiet passages (-70 LUFS absolute threshold) and applies relative gating (-10 LU) for integrated loudness

### Audio Capture
- Uses Chrome's `tabCapture` API to intercept tab audio
- Offscreen document processes audio in the background
- Real-time gain adjustment through Web Audio API nodes

## 🔧 Permissions

The extension requires the following permissions:

| Permission | Purpose |
|------------|---------|
| `tabCapture` | Capture audio from browser tabs |
| `tabs` | Access tab information |
| `activeTab` | Interact with the current tab |
| `offscreen` | Background audio processing |
| `storage` | Save user preferences |

## 📄 License

MIT

## 👤 Author

[@dsh0416](https://github.com/dsh0416)

---

<p align="center">
  <em>Make your browsing experience sonically balanced 🎵</em>
</p>
