'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGeneralSettings, useSkuOverrides, useSkus } from '@/lib/useFirestore';
import type { GeneralSettingsData, SkuOverrideData } from '@/lib/firestoreClient';

type GeneralSettings = {
  defaultSideMargin: number;
  defaultFrontMargin: number;
  defaultTopMargin: number;
  defaultGapXY: number;
  defaultGapZ: number;
  defaultMaxStackLayers?: number;
  defaultBoxPadding: number;
  packagingMaterialWeightMultiplier: number;
};

// (removed unused SkuOverride type)

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  defaultSideMargin: 0,
  defaultFrontMargin: 0,
  defaultTopMargin: 0,
  defaultGapXY: 0,
  defaultGapZ: 0,
  defaultMaxStackLayers: undefined,
  defaultBoxPadding: 0,
  packagingMaterialWeightMultiplier: 0.01,
};

// NOTE: legacy migration helpers were removed because they were unused in the app.

export default function GeneralSettings() {
  const router = useRouter();
  const { settings: firestoreSettings, loading: settingsLoading, updateSettings } = useGeneralSettings();
  const { overrides: firestoreOverrides, loading: overridesLoading, addOrUpdateOverride, removeOverride } = useSkuOverrides();
  const { skus: firestoreSkus, loading: skusLoading } = useSkus();
  
  // 繝ｭ繝ｼ繧ｫ繝ｫ邱ｨ髮・畑縺ｮ繧ｹ繝・・繝・
  const [settings, setSettings] = useState<GeneralSettingsData>(DEFAULT_GENERAL_SETTINGS);
  const [editingSkuId, setEditingSkuId] = useState('');
  const [editingOverride, setEditingOverride] = useState<Partial<SkuOverrideData>>({});

  // Firestore縺九ｉ險ｭ螳壹ｒ隱ｭ縺ｿ霎ｼ繧薙〒繝ｭ繝ｼ繧ｫ繝ｫ繧ｹ繝・・繝医↓蜿肴丐
  useEffect(() => {
    if (firestoreSettings) {
      setSettings(firestoreSettings);
    }
  }, [firestoreSettings]);

  const skuOverrides = firestoreOverrides;
  const skus = firestoreSkus;

  const handleSaveGeneral = async () => {
    try {
      await updateSettings(settings);
      alert('蜈ｨ菴楢ｨｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆');
    } catch (err) {
      alert('菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleAddOverride = async () => {
    if (!editingSkuId) {
      alert('蝠・刀繧帝∈謚槭＠縺ｦ縺上□縺輔＞');
      return;
    }

    try {
      const override: SkuOverrideData = { skuId: editingSkuId, ...editingOverride };
      await addOrUpdateOverride(override);
      setEditingSkuId('');
      setEditingOverride({});
      alert('蝠・刀蛻･險ｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆');
    } catch (err) {
      alert('菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteOverride = async (skuId: string) => {
    if (!confirm(`商品「${getSkuName(skuId)}」のオーバーライドを削除しますか？`)) {
      return;
    }
    try {
      await removeOverride(skuId);
    } catch (err) {
      alert('蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

    const handleResetSettings = async () => {
      const confirmed = confirm('全ての一般設定を0にリセットし、SKUのオーバーライドも削除します。よろしいですか？');
      if (!confirmed) return;

    const zeroSettings: GeneralSettingsData = {
      defaultSideMargin: 0,
      defaultFrontMargin: 0,
      defaultTopMargin: 0,
      defaultGapXY: 0,
      defaultGapZ: 0,
      defaultMaxStackLayers: undefined,
      defaultBoxPadding: 0,
    };
    
    try {
      await updateSettings(zeroSettings);
      // 縺吶∋縺ｦ縺ｮ繧ｪ繝ｼ繝舌・繝ｩ繧､繝峨ｒ蜑企勁
      for (const override of skuOverrides) {
        await removeOverride(override.skuId);
      }
      setSettings(zeroSettings);
      setEditingSkuId('');
      setEditingOverride({});
      sessionStorage.removeItem('lastInput');
      alert('險ｭ螳壹ｒ繝ｪ繧ｻ繝・ヨ縺励∪縺励◆');
    } catch (err) {
      alert('繝ｪ繧ｻ繝・ヨ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const getSkuName = (skuId: string) => {
    const sku = skus.find((s) => s.id === skuId);
    return sku ? sku.name : skuId;
  };

  const handleEditOverride = (skuId: string) => {
    const override = skuOverrides.find((o) => o.skuId === skuId);
    if (override) {
      setEditingSkuId(skuId);
      setEditingOverride({ ...override });
    }
  };

    if (settingsLoading || overridesLoading || skusLoading) {
    return (
      <div style={{ padding: '20px' }}>
        <button type="button" onClick={() => router.push('/calculator')} style={{ marginBottom: 16 }}>
          竊・謌ｻ繧・
        </button>
        <h1>一般設定</h1>
        <p>隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <button type="button" onClick={() => router.push('/')} style={{ marginBottom: 16 }}>
        竊・謌ｻ繧・
      </button>

  <h1>一般設定</h1>

      <section style={{ marginBottom: 32, padding: 16, border: '1px solid #ddd', borderRadius: 6 }}>
  <h2>基本設定</h2>
        <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
          <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 6, background: '#fafafa' }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>寸法余白のデフォルト (mm)</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
              蝠・刀繝悶Ο繝・け・郁､・焚蝠・刀繧偵∪縺ｨ繧√◆窶懃ｾ､窶晢ｼ峨・螟門捉縺ｫ遒ｺ菫昴☆繧倶ｽ咏區縺ｧ縺吶ょ膚蜩√↓蟾ｻ縺冗ｷｩ陦晄攝繧・∫ｾ､縺ｨ縺励※縺ｮ螳牙・菴咏區繧呈Φ螳壹＠縺ｦ縺・∪縺吶・
              邂ｱ蜀・ｯｸ縺九ｉ縺ｯ縲√％縺ｮ繝槭・繧ｸ繝ｳ縺ｨ邂ｱ蛛ｴ繝代ョ繧｣繝ｳ繧ｰ・亥ｾ瑚ｿｰ・峨ｒ荳｡蛛ｴ縺ｶ繧灘ｼ輔＞縺溷､繧呈怏蜉ｹ蟇ｸ豕輔→縺励※謇ｱ縺・∪縺吶・
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <label htmlFor="side-margin">蛛ｴ髱｢繝槭・繧ｸ繝ｳ (mm)</label>
                <input
                  id="side-margin"
                  type="number"
                  min={0}
                  value={settings.defaultSideMargin}
                  onChange={(e) => setSettings({ ...settings, defaultSideMargin: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label htmlFor="front-margin">蜑埼擇繝槭・繧ｸ繝ｳ (mm)</label>
                <input
                  id="front-margin"
                  type="number"
                  min={0}
                  value={settings.defaultFrontMargin}
                  onChange={(e) => setSettings({ ...settings, defaultFrontMargin: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label htmlFor="top-margin">荳企擇繝槭・繧ｸ繝ｳ (mm)</label>
                <input
                  id="top-margin"
                  type="number"
                  min={0}
                  value={settings.defaultTopMargin}
                  onChange={(e) => setSettings({ ...settings, defaultTopMargin: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
          <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 6, background: '#fafafa' }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>グループ/ボックス設定</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
              邂ｱ縺ｮ蜀・｣√→蝠・刀鄒､縺ｨ縺ｮ髢薙↓遒ｺ菫昴☆繧倶ｽ咏區縺ｧ縺吶ゆｸ願ｨ倥・繝ｼ繧ｸ繝ｳ縺ｨ蜷育ｮ励＠縺ｦ邂ｱ縺ｮ譛牙柑蜀・ｯｸ繧呈ｱｺ繧√∪縺吶・
            </div>
            <div>
              <label htmlFor="box-padding">邂ｱ蛛ｴ繝代ョ繧｣繝ｳ繧ｰ (mm)</label>
              <input
                id="box-padding"
                type="number"
                min={0}
                value={settings.defaultBoxPadding}
                onChange={(e) => setSettings({ ...settings, defaultBoxPadding: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
              <div style={{ fontSize: 12, color: '#444', marginTop: 8 }}>
                <strong>補足:</strong> 例）W=185mm、側余白=10mm、ボックス内余白=5mm の場合、実際の内寸は 185 - 2*(10+5) = 155mm になります。
              </div>
          </div>
          <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 6, background: '#fafafa' }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>パッキング間隔と積み方</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
              蝠・刀髢馴囮髢薙・蛟九・・陬ｽ蜩∝酔螢ｫ縺ｮ髢馴囈・医う繝ｳ繧ｿ繧｢繧､繝・Β繧ｮ繝｣繝・・・峨〒縺吶よｮｵ髢馴囮髢薙・螻､縺ｨ螻､縺ｮ髢薙・髫咎俣縺ｧ縺吶・
              縺薙ｌ繧峨・繝代ョ繧｣繝ｳ繧ｰ・亥膚蜩∫ｾ､縺ｨ邂ｱ縺ｮ蜀・・縺ｮ菴咏區・峨→縺ｯ蛻･縺ｫ縲∬｣ｽ蜩∝酔螢ｫ縺ｮ菴咏區縺ｨ縺励※謇ｱ縺・∪縺吶・
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label htmlFor="gap-xy">蝠・刀髢馴囮髢・(mm)</label>
                <input
                  id="gap-xy"
                  type="number"
                  min={0}
                  value={settings.defaultGapXY}
                  onChange={(e) => setSettings({ ...settings, defaultGapXY: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label htmlFor="gap-z">谿ｵ髢馴囮髢・(mm)</label>
                <input
                  id="gap-z"
                  type="number"
                  min={0}
                  value={settings.defaultGapZ}
                  onChange={(e) => setSettings({ ...settings, defaultGapZ: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="max-stack">最大積載層数</label>
            <input
              id="max-stack"
              type="number"
              min={1}
              placeholder="未設定(全体設定を使用)"
              value={settings.defaultMaxStackLayers ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultMaxStackLayers: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 6, background: '#fafafa', marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>梱包材換算 (重量)</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
              邂ｱ縺ｮ螟ｧ縺阪＆・亥・蟇ｸ・峨↓蟇ｾ縺励※譴ｱ蛹・攝縺ｮ驥埼㍼繧定ｨ育ｮ励☆繧九◆繧√・荵玲焚縺ｧ縺吶らｮｱ縺ｮ菴鍋ｩ・ﾃ・荵玲焚縺ｧ譴ｱ蛹・攝驥埼㍼繧堤ｮ怜・縺励∪縺吶・
            </div>
            <div>
              <label htmlFor="packaging-multiplier">譴ｱ蛹・攝驥埼㍼荵玲焚 (kg/mﾂｳ)</label>
              <input
                id="packaging-multiplier"
                type="number"
                step="0.01"
                min={0}
                value={settings.packagingMaterialWeightMultiplier}
                onChange={(e) => setSettings({ ...settings, packagingMaterialWeightMultiplier: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
              <div style={{ fontSize: 12, color: '#444', marginTop: 8, lineHeight: 1.6 }}>
                <strong>梱包材の重さ換算:</strong><br />
                紙・緩衝材などの重さは、おおよそ m² あたりの重さ (kg/m²) を用いて換算します。例えばある素材が 0.006 kg/m² で、面積が 0.75 m² であれば、重さは 0.006 * 0.75 = 0.0045 kg = 4.5 g となります。
              </div>
          </div>
          <button type="button" onClick={handleSaveGeneral} style={{ padding: '8px 16px' }}>
            蜈ｨ菴楢ｨｭ螳壹ｒ菫晏ｭ・
          </button>
          <button
            type="button"
            onClick={handleResetSettings}
            style={{ padding: '8px 16px', marginTop: 8, background: '#f5f5f5' }}
          >
            險ｭ螳壹ｒ繝ｪ繧ｻ繝・ヨ・医☆縺ｹ縺ｦ0縺ｫ荳頑嶌縺搾ｼ・
          </button>
        </div>
      </section>

        <section style={{ marginBottom: 32, padding: 16, border: '1px solid #ddd', borderRadius: 6 }}>
          <h2>SKUオーバーライド管理</h2>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
          迚ｹ螳壹・蝠・刀縺ｫ蟇ｾ縺励※縲∫ｩ阪∩荳翫￡谿ｵ謨ｰ繧・囮髢薙ｒ蛟句挨縺ｫ險ｭ螳壹〒縺阪∪縺吶よ悴蜈･蜉帙・鬆・岼縺ｯ蜈ｨ菴楢ｨｭ螳壹′驕ｩ逕ｨ縺輔ｌ縺ｾ縺吶・
        </p>

        <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>SKUオーバーライド / 管理</h3>
          <div style={{ display: 'grid', gap: 12 }}>
              <div>
              <label htmlFor="sku-select">商品を選択</label>
              <select
                id="sku-select"
                value={editingSkuId}
                onChange={(e) => setEditingSkuId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">--驕ｸ謚槭＠縺ｦ縺上□縺輔＞--</option>
                {skus.map((sku) => (
                  <option key={sku.id} value={sku.id}>
                    {sku.name} ({sku.w}×{sku.d}×{sku.h}mm)
                  </option>
                ))}
              </select>
            </div>

            {editingSkuId && (
              <>
                <div>
                  <label htmlFor="override-max-stack">SKUごとの最大積載層数</label>
                  <input
                    id="override-max-stack"
                    type="number"
                    min={1}
                    placeholder="未設定(全体設定を使用)"
                    value={editingOverride.maxStackLayers ?? ''}
                    onChange={(e) =>
                      setEditingOverride({
                        ...editingOverride,
                        maxStackLayers: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label htmlFor="override-side-margin">蛛ｴ髱｢繝槭・繧ｸ繝ｳ (mm)</label>
                  <input
                    id="override-side-margin"
                    type="number"
                    min={0}
                    placeholder="未設定(全体設定を使用)"
                    value={editingOverride.sideMargin ?? ''}
                    onChange={(e) =>
                      setEditingOverride({
                        ...editingOverride,
                        sideMargin: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label htmlFor="override-front-margin">蜑埼擇繝槭・繧ｸ繝ｳ (mm)</label>
                  <input
                    id="override-front-margin"
                    type="number"
                    min={0}
                    placeholder="未設定(全体設定を使用)"
                    value={editingOverride.frontMargin ?? ''}
                    onChange={(e) =>
                      setEditingOverride({
                        ...editingOverride,
                        frontMargin: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label htmlFor="override-top-margin">荳企擇繝槭・繧ｸ繝ｳ (mm)</label>
                  <input
                    id="override-top-margin"
                    type="number"
                    min={0}
                    placeholder="未設定(全体設定を使用)"
                    value={editingOverride.topMargin ?? ''}
                    onChange={(e) =>
                      setEditingOverride({
                        ...editingOverride,
                        topMargin: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6, background: '#fff' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>配置余白の上書き</div>
                  <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
                    蝠・刀髢馴囮髢難ｼ・apXY・峨・蛟九・・陬ｽ蜩∝酔螢ｫ縺ｮ讓ｪ譁ｹ蜷代・螂･陦梧婿蜷代・繧ｯ繝ｪ繧｢繝ｩ繝ｳ繧ｹ縺ｧ縺吶よｮｵ髢馴囮髢難ｼ・apZ・峨・螻､縺ｨ螻､縺ｮ髢薙・髫咎俣縺ｧ縺吶・
                    縺薙ｌ繧峨・陬ｽ蜩∝酔螢ｫ縺ｮ驟咲ｽｮ縺ｫ蠖ｱ髻ｿ縺励∫ｮｱ縺ｮ蜀・ｯｸ縺昴・繧ゅ・縺ｯ迢ｭ繧√∪縺帙ｓ・医ヱ繝・ぅ繝ｳ繧ｰ繧・ｷｩ陦晄攝髫咎俣縺ｯ邂ｱ蜀・ｯｸ繧堤強繧√※隧穂ｾ｡縺励∪縺呻ｼ峨・
                    譛ｪ謖・ｮ壹・蝣ｴ蜷医・蜈ｨ菴楢ｨｭ螳壹′菴ｿ逕ｨ縺輔ｌ縺ｾ縺吶・
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label htmlFor="override-gap-xy">蝠・刀髢馴囮髢・(mm)</label>
                      <input
                        id="override-gap-xy"
                        type="number"
                        min={0}
                        placeholder="未設定(全体設定を使用)"
                        value={editingOverride.gapXY ?? ''}
                        onChange={(e) =>
                          setEditingOverride({
                            ...editingOverride,
                            gapXY: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="override-gap-z">谿ｵ髢馴囮髢・(mm)</label>
                      <input
                        id="override-gap-z"
                        type="number"
                        min={0}
                        placeholder="未設定(全体設定を使用)"
                        value={editingOverride.gapZ ?? ''}
                        onChange={(e) =>
                          setEditingOverride({
                            ...editingOverride,
                            gapZ: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={handleAddOverride} style={{ padding: '8px 16px' }}>
                  縺薙・蝠・刀縺ｮ險ｭ螳壹ｒ菫晏ｭ・
                </button>
              </>
            )}
          </div>
        </div>

  <h3 style={{ fontSize: 16, marginBottom: 12 }}>登録済みオーバーライド</h3>
        {skuOverrides.length === 0 ? (
          <p style={{ color: '#999', fontSize: 14 }}>縺ｾ縺蝠・刀蛻･險ｭ螳壹′縺ゅｊ縺ｾ縺帙ｓ</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>商品</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>最大積載</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>側マージン</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>前マージン</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>上マージン</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>間隔XY</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>間隔Z</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {skuOverrides.map((override) => (
                <tr key={override.skuId}>
                  <td style={{ border: '1px solid #ddd', padding: 8 }}>{getSkuName(override.skuId)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 8 }}>
                    {override.maxStackLayers ?? '-(全体設定)'}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: 8 }}>
                    {override.sideMargin === undefined ? '-(全体設定)' : String(override.sideMargin) + ' mm'}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: 8 }}>
                    {override.frontMargin === undefined ? '-(全体設定)' : String(override.frontMargin) + ' mm'}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: 8 }}>
                    {override.topMargin === undefined ? '-(全体設定)' : String(override.topMargin) + ' mm'}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: 8 }}>
                    {override.gapXY === undefined ? '-(全体設定)' : String(override.gapXY) + ' mm'}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: 8 }}>
                    {override.gapZ === undefined ? '-(全体設定)' : String(override.gapZ) + ' mm'}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleEditOverride(override.skuId)}
                      style={{ marginRight: 8 }}
                    >
                      邱ｨ髮・
                    </button>
                    <button type="button" onClick={() => handleDeleteOverride(override.skuId)}>
                      蜑企勁
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
