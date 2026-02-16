# Building the Leading Light APK

## Prerequisites
1. **Android Studio** — [download here](https://developer.android.com/studio)
2. **Node.js** (already installed)

## Steps

### 1. Sync web assets → Android project
```bash
npm run build
```
This copies your web files into `www/` then syncs them into the Android native project.

### 2. Open in Android Studio
```bash
npm run open
```
This launches Android Studio with the `android/` project.

### 3. Build the APK
In Android Studio:
- Wait for Gradle sync to finish
- Go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### 4. Install on your phone
- Transfer the APK to your phone, or
- Connect phone via USB, enable USB debugging, and click **Run** in Android Studio

## After editing web code
Whenever you change HTML/CSS/JS, run:
```bash
npm run build
```
Then rebuild in Android Studio.

## App icon
Replace `images/icon.svg` with your own, then generate PNGs:
- `images/icon-192.png` (192×192)
- `images/icon-512.png` (512×512)
- Copy into `android/app/src/main/res/mipmap-*` folders for the native icon
