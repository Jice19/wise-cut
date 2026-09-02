#!/usr/bin/env node
/**
 * 下载 Windows FFmpeg 静态编译版到 apps/desktop/bin/win32/
 *
 * 用法: node scripts/download-ffmpeg-win.js
 *
 * 使用 gyan.dev 的 FFmpeg 静态编译版（最常用的 Windows FFmpeg 分发源）
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const FFMPEG_VERSION = '7.1.1';
const FFMPEG_URL = `https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip`;
const BIN_DIR = path.join(__dirname, '..', 'apps', 'desktop', 'bin', 'win32');
const TEMP_DIR = path.join(__dirname, '..', '.tmp-ffmpeg-download');

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const follow = (url) => {
            https
                .get(url, { timeout: 60000 }, (res) => {
                    if (
                        res.statusCode >= 300 &&
                        res.statusCode < 400 &&
                        res.headers.location
                    ) {
                        follow(res.headers.location);
                        return;
                    }
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    res.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                })
                .on('error', reject);
        };
        follow(url);
    });
}

async function main() {
    if (
        process.platform !== 'win32' &&
        process.platform !== 'darwin' &&
        process.platform !== 'linux'
    ) {
        console.log('此脚本用于下载 Windows FFmpeg 二进制，可在任何平台运行。');
    }

    // 检查是否已存在
    if (
        fs.existsSync(path.join(BIN_DIR, 'ffmpeg.exe')) &&
        fs.existsSync(path.join(BIN_DIR, 'ffprobe.exe'))
    ) {
        console.log('✅ Windows FFmpeg 二进制已存在，跳过下载。');
        console.log(`   ${path.join(BIN_DIR, 'ffmpeg.exe')}`);
        console.log(`   ${path.join(BIN_DIR, 'ffprobe.exe')}`);
        return;
    }

    console.log('📥 下载 Windows FFmpeg 静态编译版...');
    console.log(`   URL: ${FFMPEG_URL}`);

    // 创建临时目录
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    fs.mkdirSync(BIN_DIR, { recursive: true });

    const zipPath = path.join(TEMP_DIR, 'ffmpeg.zip');

    // 下载
    await download(FFMPEG_URL, zipPath);
    console.log('✅ 下载完成');

    // 解压
    console.log('📦 解压中...');
    try {
        if (process.platform === 'win32') {
            execSync(
                `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${TEMP_DIR}' -Force"`,
                { stdio: 'inherit' }
            );
        } else {
            execSync(`cd "${TEMP_DIR}" && unzip -o -q "${zipPath}"`, {
                stdio: 'inherit'
            });
        }
    } catch {
        console.error('❌ 解压失败，请手动下载并解压:');
        console.error(`   ${FFMPEG_URL}`);
        console.error(`   将 ffmpeg.exe 和 ffprobe.exe 放到: ${BIN_DIR}`);
        process.exit(1);
    }

    // 找到 ffmpeg.exe 和 ffprobe.exe
    const findExe = (name) => {
        const entries = [];
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.name === name) entries.push(full);
            }
        };
        walk(TEMP_DIR);
        return entries;
    };

    const ffmpegExes = findExe('ffmpeg.exe');
    const ffprobeExes = findExe('ffprobe.exe');

    if (ffmpegExes.length === 0 || ffprobeExes.length === 0) {
        console.error('❌ 解压后未找到 ffmpeg.exe 或 ffprobe.exe');
        console.error('请手动下载并放到: ' + BIN_DIR);
        process.exit(1);
    }

    // 复制到 bin/win32/
    fs.copyFileSync(ffmpegExes[0], path.join(BIN_DIR, 'ffmpeg.exe'));
    fs.copyFileSync(ffprobeExes[0], path.join(BIN_DIR, 'ffprobe.exe'));
    console.log('✅ 已复制到:');
    console.log(`   ${path.join(BIN_DIR, 'ffmpeg.exe')}`);
    console.log(`   ${path.join(BIN_DIR, 'ffprobe.exe')}`);

    // 清理临时文件
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log('🧹 清理临时文件完成');
}

main().catch((err) => {
    console.error('❌ 下载失败:', err.message);
    console.error('请手动下载 Windows FFmpeg 并放到: ' + BIN_DIR);
    process.exit(1);
});
