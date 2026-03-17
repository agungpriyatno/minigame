# 🎮 Arcade Protocol

**Arcade Protocol** adalah kumpulan hand-tracking games yang dibangun dengan Next.js, MediaPipe, dan Essentia.js. Aplikasi ini memanfaatkan kamera webcam untuk mendeteksi gerakan tangan dan mengubahnya menjadi interaksi game.

## 🎯 Games Yang Tersedia

### 1. Hand Slicer

Game slicing berbasis hand tracking di mana pemain harus:

- ✋ Menggunakan gerakan tangan untuk memotong orbs yang datang
- ❌ Menghindari red killer orbs
- 🎯 Mendapatkan high score dengan timing yang tepat

**Route**: `/hand-slicer`

### 2. Hand Rhythm

Rhythm game dengan beat detection di mana pemain harus:

- 🎵 Upload file audio (.mp3, .wav)
- 🎯 Hit circles yang muncul sync dengan musik
- ✋ Gunakan kedua tangan untuk bermain
- 🎼 Beat detection otomatis menggunakan Essentia.js

**Route**: `/hand-rhythm`

### 3. Pose Pong (Saber Combat)

Game Pong dengan tema cyberpunk/saber di mana tubuh Anda adalah pemukulnya:

- 👤 **Body Tracking**: Menggunakan posisi kepala dan pergelangan tangan untuk memantulkan bola.
- ⚡ **Smash Mechanic**: Lakukan 2 sentuhan berturut-turut untuk mengaktifkan Smash super cepat!
- ⚔️ **Cyberpunk UI**: Visual bertema neon saber dengan efek particle dan glow.
- 👥 **Local Multiplayer**: Mendukung pertarungan 1v1 secara lokal.

**Route**: `/pose-pong`

### 4. Hand Bubble Shooter

Game bubble shooter klasik dengan twist kontrol hand gesture:

- 🤏 **Pinch & Pull**: Jepit (pinch) jempol dan telunjuk lalu tarik untuk membidik dengan ketapel.
- 🎯 **Trajectory System**: Prediksi jalur tembakan dengan garis bantu visual.
- 🎨 **Gesture Color Change**: Hover tangan di atas palet warna untuk berganti bola.
- 💥 **Match-3 & Gravity**: Pecahkan gelembung dan lihat sisa gelembung jatuh dengan efek fisika gravity.

**Route**: `/hand-bubble-shooter`


**Features**:

- Beat detection otomatis dari audio file
- Two-hand tracking support
- Difficulty yang dapat disesuaikan
- Perfect/Good/Bad timing windows
- Combo system dengan score multipliers
- Real-time video feed dengan hand cursor overlay

## 🚀 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) dengan App Router
- **UI**: React 19, TailwindCSS 4
- **Hand Tracking**: [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html)
- **Audio Analysis**: [Essentia.js](https://mtg.github.io/essentia.js/) untuk beat detection
- **Language**: TypeScript

## 📋 Prerequisites

Pastikan sudah terinstall:

- **Node.js** 18+ atau **Bun**
- **Webcam** (untuk hand tracking)
- **Browser** modern (Chrome/Edge recommended untuk MediaPipe)

## 🛠️ Installation

1. **Clone repository**:

   ```bash
   git clone <repository-url>
   cd minigame
   ```

2. **Install dependencies**:

   ```bash
   # Menggunakan npm
   npm install

   # Atau menggunakan bun (recommended)
   bun install
   ```

## 🎮 Running the Application

### Development Mode

```bash
# Menggunakan npm
npm run dev

# Atau menggunakan bun
bun dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

### Production Build

```bash
# Build aplikasi
npm run build

# Jalankan production server
npm start
```

## 📖 Usage Guide

### Hand Slicer

1. Buka `/hand-slicer`
2. Izinkan akses webcam
3. Gunakan tangan untuk slice orbs
4. Hindari red killer orbs

7. Hit circles tepat waktu untuk mendapat Perfect/Good/Bad scores

### Pose Pong

1. Buka `/pose-pong`
2. Posisikan diri Anda di depan kamera hingga terdeteksi sebagai Warrior A/B.
3. Gunakan **kepala** atau **pergelangan tangan** (wrists) untuk memantulkan bola plasma.
4. Hit bola **dua kali berturut-turut** di area sendiri untuk melakukan **SMASH** ⚡.
5. Lawan harus menangkis SMASH tersebut untuk menormalkan kembali kecepatan bola.

### Hand Bubble Shooter

1. Buka `/hand-bubble-shooter`
2. Gunakan **telunjuk & jempol** untuk melakukan gerakan menjepit (pinch).
3. **Jepit** di area ketapel, **Tarik ke bawah** untuk membidik, dan **Lepaskan** untuk menembak.
4. Untuk mengganti warna, arahkan cursor tangan ke atas palet warna di bawah layar selama 0.5 detik.


**Tips**:

- Gunakan **kedua tangan** untuk hit rate lebih tinggi
- Lighting yang baik meningkatkan hand tracking accuracy
- Pastikan tangan terlihat jelas di kamera

## 🎨 Game Configuration

### Hand Rhythm Settings

Anda dapat adjust difficulty di `src/lib/constants.ts`:

```typescript
export const GAME_CONFIG = {
  HIT_CIRCLE_RADIUS: 60, // Ukuran target circle
  HAND_CURSOR_RADIUS: 25, // Ukuran cursor tangan
  APPROACH_TIME: 3000, // Waktu circle muncul (ms)
  TIMING_WINDOWS: {
    PERFECT: 100, // Perfect timing window (ms)
    GOOD: 250, // Good timing window (ms)
    BAD: 400, // Bad timing window (ms)
  },
};
```

### Beat Filtering

Beat filter settings di `src/lib/gameEngine.ts`:

```typescript
const BEAT_FILTER_CONFIG = {
  MIN_INTENSITY: 0.6, // Only strong beats (0.0-1.0)
  MIN_GAP_MS: 600, // Minimum gap between circles (ms)
};
```

## 📁 Project Structure

```
minigame/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── hand-slicer/         # Hand Slicer game
│   │   ├── hand-rhythm/         # Hand Rhythm game
│   │   ├── hand-bubble-shooter/ # Hand Bubble Shooter game
│   │   └── pose-pong/           # Pose Pong game
│   ├── components/
│   │   ├── HandRhythmGame.tsx  # Rhythm game core
│   │   └── PosePongGame.tsx    # Pose Pong engine
│   ├── lib/

│   │   ├── constants.ts         # Game configuration
│   │   ├── gameEngine.ts        # Game logic & beat filtering
│   │   ├── essentiaAnalyzer.ts  # Audio beat detection
│   │   └── renderer.ts          # Canvas rendering
│   └── types/
│       └── game.ts              # TypeScript types
├── public/                       # Static assets
└── package.json
```

## 🎯 Features

### Hand Rhythm Game

- ✅ Real-time hand tracking (1-2 hands)
- ✅ Automatic beat detection from audio
- ✅ Advanced beat filtering (intensity + spacing)
- ✅ Visual feedback (Perfect/Good/Bad)
- ✅ Combo system with multipliers
- ✅ Score tracking
- ✅ Particle effects
- ✅ Configurable difficulty

### Hand Slicer Game

- ✅ Hand gesture recognition
- ✅ Object slicing mechanics
- ✅ Avoid obstacles gameplay

### Pose Pong (Saber Combat)

- ✅ Full body tracking (Head & Wrists)
- ✅ Cyberpunk neon aesthetics
- ✅ Advanced Smash logic (Consecutive touch tracking)
- ✅ Adaptive visual states (Charging, Smashed)
- ✅ Multiplayer support

### Hand Bubble Shooter

- ✅ Pinch-and-pull slingshot mechanics
- ✅ Color selection via hover gesture
- ✅ Grid match-3 algorithm
- ✅ Gravity physics for hanging bubbles
- ✅ Background music and SFX integration


## 🐛 Troubleshooting

### Webcam Tidak Terdeteksi

- Pastikan browser sudah granted permission untuk webcam
- Coba refresh page dan izinkan ulang
- Gunakan Chrome/Edge (recommended)

### Hand Tracking Tidak Akurat

- Pastikan lighting cukup terang
- Background polos lebih baik
- Jaga jarak ~50-100cm dari kamera
- Pastikan seluruh tangan terlihat

### Audio File Tidak Bisa Di-upload

- Support format: .mp3, .wav
- File size maksimal bergantung browser
- Pastikan file tidak corrupt

### Circles Terlalu Banyak/Sedikit

Adjust di `src/lib/gameEngine.ts`:

- Tingkatkan `MIN_INTENSITY` untuk lebih sedikit circles
- Kurangi `MIN_INTENSITY` untuk lebih banyak circles
- Adjust `MIN_GAP_MS` untuk spacing

## 📝 License

MIT License - feel free to use for learning purposes.

## 🤝 Contributing

Contributions welcome! Feel free to:

- Report bugs
- Suggest new games
- Improve hand tracking accuracy
- Add new features

---

**Built with ❤️ using Next.js, MediaPipe, and Essentia.js**
