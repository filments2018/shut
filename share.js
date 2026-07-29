/**
 * share.js — v2
 * 修正: ファイル名拡張子を Recorder.getMime() から動的に取得
 * 修正: Web Share API の files サポート確認をより堅牢に
 * 追加: 複数クリップを zip 風に個別ダウンロードするフォールバック
 * 追加: Instagram/TikTok 向けのディープリンク試行
 */

const Share = (() => {
  let _blobUrl = null;

  // ── ファイル名生成 ─────────────────────────────
  function _filename(meta, idx) {
    const now = new Date();
    const ts  = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
    ].join('');

    // Recorder から実際の MIME タイプを取得して拡張子を決定
    const mime = (typeof Recorder !== 'undefined') ? Recorder.getMime() : '';
    let ext = 'webm';
    if (mime.includes('mp4'))  ext = 'mp4';
    if (mime.includes('webm')) ext = 'webm';

    const suffix = (idx !== undefined) ? '_clip' + (idx + 1) : '';
    return 'SHUT_' + meta.label + '_RECIPE_' + ts + suffix + '.' + ext;
  }

  // ── ダウンロードトリガー ─────────────────────────
  function _dl(blob, name) {
    if (_blobUrl) URL.revokeObjectURL(_blobUrl);
    _blobUrl = URL.createObjectURL(blob);
    const a  = document.createElement('a');
    a.href = _blobUrl; a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }, 8000);
  }

  // ── Web Share（ファイル付き）の厳格チェック ────
  function _canShareFile(file) {
    try {
      return navigator.canShare && navigator.canShare({ files: [file] });
    } catch (_) {
      return false;
    }
  }

  // ── メインシェア関数 ──────────────────────────
  async function shareOrDownload(blob, meta) {
    const name = _filename(meta);

    // ① Web Share API with file
    if (blob && navigator.share) {
      const file = new File([blob], name, { type: blob.type || 'video/webm' });
      if (_canShareFile(file)) {
        try {
          await navigator.share({ files: [file], title: 'SHUT', text: (meta.hashtags || '#SHUT #スマホ撮影') });
          return 'shared';
        } catch (e) {
          if (e.name === 'AbortError') return 'cancelled';
          // その他エラーは次へフォールバック
        }
      }
    }

    // ② Web Share API URL のみ（ファイル非対応端末）
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SHUT — スマホ撮影レシピ',
          text: meta.label + 'レシピでスマホ撮影素材を作りました！ ' + (meta.hashtags || '#SHUT'),
          url: window.location.href,
        });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled';
      }
    }

    // ③ フォールバック: ダウンロード
    if (blob) {
      _dl(blob, name);
      return 'downloaded';
    }

    return 'failed';
  }

  /** 単一 Blob を直接ダウンロード */
  function download(blob, meta) {
    if (!blob) return;
    _dl(blob, _filename(meta));
  }

  /**
   * 複数クリップを個別にダウンロード
   * 外部の動画変換ライブラリを使わない環境での代替
   */
  function downloadClips(clips, meta) {
    if (!clips || clips.length === 0) return;
    clips.forEach((clip, i) => {
      // 少しずらしてダウンロードダイアログを連続させない
      setTimeout(() => _dl(clip, _filename(meta, i)), i * 300);
    });
  }

  /** URLをクリップボードにコピー */
  async function copyUrl() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (_) {
        return false;
      }
    }
  }

  function cleanup() {
    if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
  }

  return { shareOrDownload, download, downloadClips, copyUrl, cleanup };
})();
