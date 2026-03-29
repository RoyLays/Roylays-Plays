# 🎮 Roylays Plays | Web J2ME Emulator

Welcome to **Roylays Plays**, a modernized web platform designed to play classic Java ME (`.jar`) mobile games right in your browser! 

We took the incredible core emulator engine of `freej2me-web` and wrapped it in a sleek, full-featured gaming hub with advanced control mapping. 

🚀 **Live App:** [Play Now on Roylays Plays](https://roylays.github.io/Roylays-Plays/web/)

---

## ✨ Features
* 🕹️ **Modern Gaming Hub:** Manage your installed games, view your play history, and save favorites directly in the browser's UI.
* ⌨️ **Dynamic Control Schemes:** Choose between Classical (Numpad), Modern (WASD + Mouse), or Pro (Gamepad).
* 🎮 **Plug-and-Play Gamepad Support:** Connect your Xbox, PlayStation, or USB controller with full button mapping and **Haptic Feedback**.
* 🔒 **Secure & Local:** Powered by WebAssembly, games run entirely in your browser's local sandbox.

---

## 🕹️ Controls & Peripherals

We offer three completely different ways to play. You can test your inputs live in the "Controls" menu!

### 1. Classical Controls (Keyboard)
Traditional layout mimicking old keypads—perfect for purists.
* **Movement:** Arrow Keys (`↑`, `↓`, `←`, `→`)
* **Action / OK:** `Enter`
* **Soft Keys:** `F1` / `Q` (Left)  |  `F2` / `W` (Right)
* **Keypad:** `0` - `9`
* **Special Keys:** `E` (*)  |  `R` (#)
* **Emulator Options:** `Esc`

### 2. Modern Controls (Keyboard + Mouse)
Familiar FPS-style layout for modern gamers.
* **Movement:** `W`, `A`, `S`, `D`
* **Action / OK:** `Right Click`
* *(Keypad and Soft Keys remain the same as Classical)*

### 3. Pro Controls (Controller) ⚡ *Haptic Feedback*
Plug in a USB or Bluetooth controller to play mobile classics like console games!
* **Movement:** `D-Pad`
* **Action / Enter:** `A`
* **Back / Right Soft Key:** `B`
* **Keypad 5 (Fire / Interact):** `X`
* **Keypad 0:** `Y`
* **Left / Right Soft Keys:** `LB` / `RB`
* **Special Keys (* and #):** `LT` / `RT`

---

## 🛠️ How to Play
1. Go to the [Roylays Plays Web App](https://roylays.github.io/Roylays-Plays/web/).
2. Click **Add Game** in the sidebar.
3. Select your `.jar` file from your computer.
4. Go to **Home**, click **Play** on your newly installed game, and enjoy! 

*(Note: If a game is rendering weirdly, press `Esc` during gameplay to tweak the display size or compatibility flags).*

---

## ⚙️ Under the Hood & Credits
This project is a customized UI frontend built on top of amazing open-source technology:
* **Core Emulator:** Powered by [zb3's fork of freej2me](https://github.com/zb3/freej2me-web).
* **Java Engine:** Runs using [CheerpJ](https://cheerpj.com/) to translate Java bytecode to WebAssembly in real-time.
* **Graphics & Audio:** Features WebGL 2 for 3D support (M3G, Mascot Capsule v3), and compiled WebAssembly modules (`libmidi`, `libmedia`) for authentic classic mobile audio.
