# CryWolf
[在线试玩](https://gensisboss.github.io/CryWolf/)

狼来了小游戏，使用 Cocos Creator 3.8.4 制作。

Native Cocos Creator 3.8.4 migration of the `SlideWeb` puzzle game.

## Structure

- `assets/game/scripts/domain`: engine-independent game and editor rules.
- `assets/game/scripts/data`: Cocos resource loading and data normalization.
- `assets/game/scripts/storage`: progress, guide, and custom-level persistence.
- `assets/game/scripts/presentation`: sprite catalog and world-coordinate board nodes.
- `assets/game/scripts/ui`: native Cocos UI construction and game orchestration.
- `assets/resources`: imported art, levels, and guide data.
- `assets/scenes/Main.scene`: single startup scene with the `GameApp` component.
- `tests`: automated rule, data-encoding, editor, and scene-reference checks.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run preview:web
```

The preview command serves the latest `build/web-mobile` output at
`http://127.0.0.1:7456` unless that port is already occupied. Set `PORT` to
use another port.

## WeChat Mini Game

Build the `wechatgame` platform in Creator 3.8.4 with `Main.scene` as the
startup scene and portrait orientation. Configure the real AppID in Creator or
WeChat DevTools before upload. Runtime input, storage, clipboard, JSON loading,
sprites, tweens, and UI use Cocos or guarded WeChat APIs; no DOM gameplay layer
is used.
