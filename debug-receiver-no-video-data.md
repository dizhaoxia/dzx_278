# Debug Session: receiver-no-video-data
- **Status**: [OPEN]
- **Issue**: A 端设置了屏幕共享后，B 端（Receiver）无法收到 A 端共享的屏幕视频数据，页面显示 "awaiting signal" 状态。
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-receiver-no-video-data.ndjson

## Reproduction Steps
1. 启动 `pnpm dev`（前端 50003，后端 30003）
2. 打开浏览器窗口 A，访问 `http://localhost:50003/`，选择 A 端 / 推流，点击「创建房间」，进入 Sender 页面，点击「捕获屏幕」并选择共享源
3. 打开浏览器窗口 B（或新标签页），访问 `http://localhost:50003/`，选择 B 端 / 拉流，输入房间号，点击「加入房间」
4. **预期结果**：B 端页面显示 A 端共享的屏幕画面
5. **实际结果**：B 端页面显示 "awaiting signal"，无视频画面

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Sender 的 `localStream` 就绪后未触发协商（useEffect 依赖缺失） | **Confirmed ✅** | Low | 日志显示 `peersLength=1, hasStream=false`；B 端加入时 A 端流未就绪，之后流就绪但 useEffect 不触发 |
| B | 信令服务器未正确转发 Offer/Answer/ICE 消息 | Rejected ❌ | Low | 日志显示 `peer-joined`、`state` 等消息正常转发，信令服务器逻辑正确 |
| C | Receiver 的 ontrack 回调未被触发 | Unverified (根因在 A 端) | Low | 因 A 端未发起 Offer，C 无法验证，但已修复 D 端 video.play() 作为防御性修复 |
| D | Receiver 收到流后未调用 video.play() | Partially Fixed 🛡️ | Low | 动态设置 `srcObject` 后浏览器某些场景不会自动播放，已增加显式 `play()` 调用 |
| E | 视频编码协商失败 | Confirmed (部分) ✅ | Medium | `applyReceiverCodecPreferences` 使用原始 codec 列表而非 VP8→H264 优先重排后的列表，已修复 |

## Root Cause Analysis (3 个问题)

### Bug 1: [主因] Sender 协商触发 useEffect 缺少 `localStream` 依赖（假设 A）
- **位置**: [useSenderConnection.ts](file:///Users/feixuan/Desktop/solo/dzx_278/src/hooks/useSenderConnection.ts#L130-L137)
- **问题**: `useEffect` 依赖是 `[peers, startNegotiation]`，触发条件需要 `peers.length > 0 && streamRef.current`。但 `streamRef` 是 ref，其变化不会触发 re-render。
- **场景复现**:
  1. 用户在 Sender 页面点击「创建房间」→ peers=0，无流
  2. 用户尚未点击「捕获屏幕」，B 端先加入了房间 → peers=1，此时 streamRef.current 仍为 null → 不触发
  3. 用户点击「捕获屏幕」并选择共享源 → streamRef.current 设置为有效值，但 useEffect 的依赖 `[peers, startNegotiation]` 都没有变化 → **不触发** ❌
- **修复**: 在依赖数组中加入 `localStream`（state 变量），这样流就绪时 useEffect 会重新执行。

### Bug 2: Receiver video.play() 未显式调用（假设 D，防御性修复）
- **位置**: [Receiver.tsx](file:///Users/feixuan/Desktop/solo/dzx_278/src/pages/Receiver.tsx#L20-L30)
- **问题**: `<video>` 标签有 `autoPlay` 属性，但动态设置 `srcObject` 后某些浏览器场景下不会自动触发播放。
- **修复**: 设置 `srcObject` 后显式调用 `video.play()`，并 catch 掉 autoplay policy 异常（video 已 muted，应该不会触发）。

### Bug 3: applyReceiverCodecPreferences 未按 VP8→H264 优先重排（假设 E）
- **位置**: [webrtc.ts](file:///Users/feixuan/Desktop/solo/dzx_278/src/lib/webrtc.ts#L52-L63)
- **问题**: 使用了原始的 `caps.codecs` 而非 `getPreferredCodecs()` 返回的 VP8 优先重排列表。
- **修复**: 改为调用 `getPreferredCodecs()`，与 Sender 端 `applyCodecPreference` 保持一致。

## Log Evidence

### Pre-fix 关键日志（runId: pre）
```
# B 端加入时，A 端 negotiation trigger 检查：peers=1 但 stream 为空
useSenderConnection.ts:124 → peersLength: 1, hasStream: false, hasPc: false

# 后续没有 Offer 相关日志，说明 startNegotiation 从未执行
# 也没有 forward offer/answer/candidate 的日志
```

### Post-fix 验证日志（runId: post）
```
# 待用户手动验证：B 端加入后 A 端再捕获屏幕，应看到:
# 1. negotiation trigger: peersLength=1, hasStream=true, hasLocalStream=true
# 2. Offer created and sent
# 3. Receiver got offer → Answer created and sent
# 4. ontrack fired → remoteStream bound to video, calling play()
```

## Fix Patches

### Patch 1: useSenderConnection.ts - useEffect 依赖修复
```diff
-  }, [peers, startNegotiation]);
+  }, [peers, localStream, startNegotiation]);
```

### Patch 2: Receiver.tsx - 显式 play() 调用
```diff
    if (videoRef.current) {
      videoRef.current.srcObject = remoteStream;
+     if (remoteStream) {
+       videoRef.current.play().catch(() => {});
+     }
    }
```

### Patch 3: webrtc.ts - applyReceiverCodecPreferences 修复
```diff
- const caps = RTCRtpReceiver.getCapabilities?.("video")
- const preferred = caps?.codecs ?? []
+ const preferred = getPreferredCodecs()
  if (!preferred.length) return
  for (const t of pc.getTransceivers()) {
    try {
-     t.setCodecPreferences(preferred)
+     t.setCodecPreferences(preferred as RTCRtpCodec[])
    } catch {}
  }
```

## Verification Conclusion
[待用户手动验证]

### 用户验证步骤
1. 重启开发服务器（已运行在 http://localhost:50003/）
2. **浏览器窗口 A（Sender）**: 访问首页 → 选择「A 端 / 推流」→ 点击「创建房间」→ **暂不点击捕获屏幕**
3. **浏览器窗口 B（Receiver）**: 访问首页 → 选择「B 端 / 拉流」→ 输入房间号 → 点击「加入房间」
4. **回到浏览器窗口 A**: 点击「捕获屏幕」→ 选择任意共享源
5. **观察**: 约 2-5 秒后，B 端应能看到 A 端共享的屏幕画面
6. **额外验证**: 也可以测试「A 端先捕获屏幕，B 端后加入」的场景，两种顺序均应正常工作

## Post-fix Checklist
- [ ] 场景 1: A 先捕获屏幕 → B 后加入 → B 能看到画面
- [ ] 场景 2: B 先加入房间 → A 后捕获屏幕 → B 能看到画面
- [ ] Sender 端 Status Panel 显示 PC · LINKED
- [ ] Receiver 端 Status Panel 显示 PC · LINKED + 码率/分辨率数值
