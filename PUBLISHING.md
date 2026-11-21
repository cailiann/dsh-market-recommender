# 涓婃灦鎸囧崡 / Publishing guide

鐩爣锛氳 `dshmarket` 鐨勩€屾彃浠跺競鍦恒€嶉噷鍑虹幇杩欎釜鎻掍欢銆?*涓婃灦 = 鍏紑 GitHub 浠撳簱 + 寰€ awesome-dsh-plugin 娓呭崟鎻愪竴涓?YAML**锛屼笉鍙?npm 涔熷彲浠ャ€?
涓嬮潰 `<owner>` 涓€寰嬫浛鎹㈡垚浣犵殑 GitHub 鐢ㄦ埛鍚嶏紝浠撳簱鍚嶅浐瀹氱敤 `dsh-market-recommender`銆?
---

## 0. 鍏堟浛鎹袱澶勫崰浣嶇

| 鏂囦欢 | 鐜板湪 | 鏀规垚 |
|---|---|---|
| `package.json` 鈫?`repository.url` | `cailiann` | 浣犵殑 GitHub 鐢ㄦ埛鍚?|
| `LICENSE` | `cailiann` | 浣犵殑鍚嶅瓧鎴栫敤鎴峰悕 |

```powershell
cd C:\Users\HUAWEI\Documents\deepseek-harness\default-workspace\plugins\dsh-market-recommender
(Get-Content package.json -Raw) -replace 'cailiann','<owner>' | Set-Content package.json -Encoding utf8
(Get-Content LICENSE -Raw) -replace 'cailiann','<owner>' | Set-Content LICENSE -Encoding utf8
```

鍙€夛細鍋氫竴寮?**180脳180 鐨?PNG 鍥炬爣**鏀捐繘 `assets/icon-180.png`锛屾竻鍗曠殑 `icon` 瀛楁闇€瑕佷綅鍥撅紙鐜板湪鐨?`icon.svg` 鍙粰鎻掍欢绠＄悊鍣ㄧ敤锛屾竻鍗曚笉鏀?SVG锛夈€?
---

## 1. 鏈湴鑷锛堟竻鍗?CI 浼氭煡杩欎簺锛?
```powershell
cd C:\Users\HUAWEI\Documents\deepseek-harness\default-workspace\plugins\dsh-market-recommender
Get-Content package.json -Raw | ConvertFrom-Json | Select-Object name,version,license
Test-Path cordis.patch.yml
```

蹇呴』鍚屾椂婊¤冻锛堣繖鏄渶甯歌鐨勮鎷掑師鍥狅級锛?
- `package.json` 鏈?**`dsh.bundle.patch`**锛堜笉鍙槸 `dsh.client`锛?- 鏃佽竟鏈?`cordis.patch.yml`
- `cordis.patch.yml` 閲岀殑 `name` **绛変簬** `package.json` 鐨?`name`
- `client.js` 绗竴琛岀殑 `id` **绛変簬** `package.json` 鐨?`name`

```powershell
$n = (Get-Content package.json -Raw | ConvertFrom-Json).name
$p = (Select-String cordis.patch.yml -Pattern "name: '(.+)'" ).Matches[0].Groups[1].Value
$c = (Select-String client.js -Pattern "^  id: '(.+)'" ).Matches[0].Groups[1].Value
"package=$n"; "patch=$p"; "client=$c"
if ($n -eq $p -and $n -eq $c) { "OK 涓夊涓€鑷? } else { "涓嶄竴鑷达紝鍏堟敼" }
```

---

## 2. 寤轰粨搴撳苟鎺ㄩ€?
```powershell
cd C:\Users\HUAWEI\Documents\deepseek-harness\default-workspace\plugins\dsh-market-recommender
git init
git add -A
git commit -m "feat: plugin market recommender"
gh repo create dsh-market-recommender --public --source=. --remote=origin --push
```

娌℃湁 `gh` 灏卞湪缃戦〉涓婃柊寤虹┖浠撳簱锛岀劧鍚庯細

```powershell
git remote add origin https://github.com/<owner>/dsh-market-recommender.git
git branch -M main
git push -u origin main
git tag v1.1.0
git push origin v1.1.0
```

**浠撳簱閲屽簲璇ュ彧鏈夎繖 10 涓枃浠?*锛歚package.json`銆乣cordis.patch.yml`銆乣index.js`銆乣client.js`銆乣lib/`锛? 涓級銆乣locale/`锛? 涓級銆乣icon.svg`銆乣LICENSE`銆乣README.md`銆乣PUBLISHING.md`銆備笉瑕佹彁浜?`node_modules`銆?
---

## 3. 鍏堥獙璇佸埆浜鸿兘瑁咃紙娓呭崟鍚堝苟鍓嶄篃鑳借锛?
鎶婁笅闈㈢殑鍦板潃鎹㈡垚浣犵殑锛屽湪鏈満浠绘剰鐩綍鎵ц锛?
```powershell
dsh plugin --profile desktop add github:<owner>/dsh-market-recommender
```

瑁呭畬閲嶅紑 DSH锛屾彃浠堕〉搴斿嚭鐜般€屾帹鑽愩€嶉〉绛俱€傝繖涓€姝ヨ繃浜嗭紝鍐嶆彁娓呭崟鈥斺€旂渷寰楄鎵撳洖銆?
> 浣犺繖鍙版満鍣ㄤ笂宸茬粡瑁呯殑鏄悓涓€浠戒唬鐮侊紙鏈湴鐩綍閾炬帴锛夛紝杩欎竴鏉?*涓嶉渶瑕?*鍐嶈窇锛涘畠楠岃瘉鐨勬槸"浠?GitHub 鎷変笅鏉ヨ兘鍚︽甯稿伐浣?锛屾渶濂藉湪鍙︿竴鍙版満鍣ㄦ垨鍙︿竴涓?profile 涓婅瘯銆?
---

## 4. 鎻愪氦娓呭崟锛堢湡姝ｇ殑銆屼笂鏋躲€嶏級

1. Fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`
2. 鍦?`data/plugins/` 鏂板缓涓€涓枃浠讹紝鏂囦欢鍚?`<owner>__dsh-market-recommender.yml`
3. 鍐呭锛堟妸 `<owner>` 鎹㈡帀锛夛細

```yaml
url: https://github.com/<owner>/dsh-market-recommender
name: <owner>/dsh-market-recommender
category: market
description:
  en: Recommends an existing plugin before a new one is written. One sentence in the Plugins page searches your configured indexes, the community catalog and the built-in plugins, then installs or enables the match you pick.
  zh: '鍐欐柊鎻掍欢涔嬪墠鍏堟煡甯傚満锛氬湪鎻掍欢椤佃緭鍏ヤ竴鍙ラ渶姹傦紝鎼滅储宸查厤缃殑绱㈠紩銆佺ぞ鍖虹洰褰曚笌 DSH 鍐呯疆鎻掍欢锛岄€変腑鍚庣洿鎺ュ畨瑁呮垨鍚敤銆?
# icon: https://raw.githubusercontent.com/<owner>/dsh-market-recommender/main/assets/icon-180.png
```

瑙勫垯锛堟潵鑷畼鏂?contributing.md锛夛細

- `url` 蹇呴』涓庝粨搴?*瀹屽叏涓€鑷?*
- 鍙湁 `description.en` 蹇呭～锛屼竴鍙ヨ瘽銆佷互鍙ュ彿缁撳熬
- 鎻忚堪閲屽嚭鐜?`: `锛堣嫳鏂囧啋鍙峰姞绌烘牸锛?*蹇呴』鍔犲紩鍙?*锛屽惁鍒?YAML 瑙ｆ瀽澶辫触
- 涓€涓?PR 鏈€澶?3 鏉?- 涓嶈鎵嬫敼 `README.md` / `README.zh.md`锛堝畠浠敱鑴氭湰浠?`data/plugins/*.yml` 鐢熸垚锛?
4. 寮€ PR锛屾爣棰樺啓 `Add <owner>/dsh-market-recommender`锛屾鏂囬檮涓€鍙?宸查獙璇佸彲鐢?+ 鐗堟湰 + 鎴浘鍙€?銆?
---

## 5. 鍚堝苟涔嬪悗

- 娓呭崟鍚堝苟鍚?`main` 涓婁細鑷姩閲嶇敓鎴?README锛宍awesome-dsh-plugin.com` 鐨?`plugins.json` 闅忎箣鏇存柊锛沗dshmarket` 姣忓ぉ鎷変竴娆★紝閫氬父**褰撳ぉ鎴栨鏃?*灏辫兘鍦ㄣ€屾彃浠跺競鍦?鈫?鍙戠幇銆嶆悳鍒般€?- 鍥犱负娌″彂 npm锛屽競鍦哄畨瑁呰蛋 GitHub 婧愮爜锛坧npm 鐜板満鎷夛級锛屾瘮 npm 鍖呮參鍑犵鍒板嚑鍗佺锛屼釜浜烘彃浠跺畬鍏ㄥ鐢ㄣ€?
---

## 6. 浠ュ悗鍙戞柊鐗?
```powershell
# 1) 鏀?package.json 鐨?version
git add -A; git commit -m "chore: v1.1.1"; git tag v1.1.1; git push origin main --tags
```

- 璧?GitHub 鏉ユ簮鏃讹紝甯傚満鎸変粨搴撴渶鏂扮姸鎬佸垽鏂洿鏂帮紝**璁板緱鎵?tag 骞跺缓 GitHub Release**锛堜綔鑰呭彲闄勯鏋勫缓 `.tgz`锛屽競鍦轰細浼樺厛鐢ㄥ畠锛岀渷鎺夌幇鍦烘瀯寤猴級銆?- 娓呭崟閲岀殑鏉＄洰**涓嶉渶瑕?*涓烘瘡涓増鏈敼涓€娆°€?
---

## 甯歌琚嫆鍘熷洜

| 鐜拌薄 | 鍘熷洜 |
|---|---|
| 鎵撳洖锛歯ot installable | 鍙啓浜?`dsh.client`锛屾紡浜?`dsh.bundle` |
| 鎵撳洖锛歶rl mismatch | YAML 鐨?`url` 鍜岀湡瀹炰粨搴撳湴鍧€涓嶄竴鑷达紙澶氫簡 `/tree/鈥銆佸ぇ灏忓啓涓嶅悓锛?|
| CI 鎶?YAML 瑙ｆ瀽閿?| 鎻忚堪閲屾湁 `: ` 娌″姞寮曞彿 |
| 瑁呬笂浜嗕絾娌＄晫闈?| `client.js` 鐨?`id` 鎴?`cordis.patch.yml` 鐨?`name` 涓庡寘鍚嶄笉涓€鑷?|
| 甯傚満閲屾悳涓嶅埌 | 娓呭崟杩樻病鍚堝苟锛屾垨 `dshmarket` 杩樻病鎷夋柊鐩綍锛堢瓑涓€澶╋紱涔熷彲鍦ㄦ彃浠跺競鍦洪〉闈㈡墜鍔ㄥ埛鏂扮洰褰曪級 |

---

## 杩欎竴鐗堝疄鐜扮殑涓ゆ潯纭姹傦紙宸叉弧瓒筹級

- `package.json` 鏈?`dsh.bundle.patch` 鈫?`./cordis.patch.yml`
- `cordis.patch.yml` 鎻掑叆涓€琛?`dsh-market-recommender`锛屾寚鍚戝悓鍚嶅寘
- 瀹㈡埛绔竴鍗婇€氳繃 `exports["./client"]` 鏆撮湶锛宍dsh.client.platform: "web"`
- `engines.dsh: ">=0.2.2-rc.5"`锛氫綆浜庤繖涓増鏈殑 DSH 娌℃湁 `plugins.tab` 鎻掓Ы锛岃涓婁篃涓嶄細鍑虹幇椤电
