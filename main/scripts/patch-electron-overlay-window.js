#!/usr/bin/env node
/**
 * Patches electron-overlay-window to fix HiDPI coordinate conversion on Linux.
 *
 * The library only converts physical->logical coordinates on Windows,
 * but Linux with HiDPI scaling needs the same treatment.
 *
 * This script is run as a postinstall hook.
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', 'electron-overlay-window', 'dist', 'index.js');

if (!fs.existsSync(filePath)) {
  console.log('[patch] electron-overlay-window not found, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');

// Check if already patched
if (content.includes("process.platform === 'linux'") && content.includes('// Find the display containing the target window')) {
  console.log('[patch] electron-overlay-window already patched');
  process.exit(0);
}

// The original code only handles Windows
const originalCode = `        if (process.platform === 'win32') {
            lastBounds = electron_1.screen.screenToDipRect(this.electronWindow, this.targetBounds);
        }
        this.electronWindow.setBounds(lastBounds);
        // if moved to screen with different DPI, 2nd call to setBounds will correctly resize window
        // dipRect must be recalculated as well
        if (process.platform === 'win32') {
            lastBounds = electron_1.screen.screenToDipRect(this.electronWindow, this.targetBounds);
            this.electronWindow.setBounds(lastBounds);
        }`;

// The patched code handles both Windows and Linux
const patchedCode = `        if (process.platform === 'win32') {
            lastBounds = electron_1.screen.screenToDipRect(this.electronWindow, this.targetBounds);
        }
        else if (process.platform === 'linux') {
            // On Linux with HiDPI, targetBounds are in physical pixels but setBounds expects logical/DIP coords
            // Find the display containing the target window and convert using its scale factor
            const targetCenter = { x: this.targetBounds.x + this.targetBounds.width / 2, y: this.targetBounds.y + this.targetBounds.height / 2 };
            const displays = electron_1.screen.getAllDisplays();
            let targetDisplay = electron_1.screen.getPrimaryDisplay();
            for (const display of displays) {
                // Check in physical coordinates - display.bounds are in logical, so multiply by scaleFactor
                const physBounds = {
                    x: display.bounds.x * display.scaleFactor,
                    y: display.bounds.y * display.scaleFactor,
                    width: display.bounds.width * display.scaleFactor,
                    height: display.bounds.height * display.scaleFactor
                };
                if (targetCenter.x >= physBounds.x && targetCenter.x < physBounds.x + physBounds.width &&
                    targetCenter.y >= physBounds.y && targetCenter.y < physBounds.y + physBounds.height) {
                    targetDisplay = display;
                    break;
                }
            }
            const sf = targetDisplay.scaleFactor;
            if (sf > 1) {
                lastBounds = {
                    x: Math.round(this.targetBounds.x / sf),
                    y: Math.round(this.targetBounds.y / sf),
                    width: Math.round(this.targetBounds.width / sf),
                    height: Math.round(this.targetBounds.height / sf)
                };
            }
        }
        this.electronWindow.setBounds(lastBounds);
        // if moved to screen with different DPI, 2nd call to setBounds will correctly resize window
        // dipRect must be recalculated as well
        if (process.platform === 'win32') {
            lastBounds = electron_1.screen.screenToDipRect(this.electronWindow, this.targetBounds);
            this.electronWindow.setBounds(lastBounds);
        }`;

if (!content.includes(originalCode)) {
  console.log('[patch] Could not find original code to patch in electron-overlay-window');
  console.log('[patch] The library may have been updated - manual patching may be required');
  process.exit(1);
}

content = content.replace(originalCode, patchedCode);
fs.writeFileSync(filePath, content, 'utf8');
console.log('[patch] Successfully patched electron-overlay-window for Linux HiDPI support');
