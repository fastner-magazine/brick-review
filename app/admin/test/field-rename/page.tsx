"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DocPreview = { id: string; data: Record<string, any> };

export default function FieldRenameTestPage() {
    const [collection, setCollection] = useState("");
    const [subcollection, setSubcollection] = useState<string | null>(null);
    const [docs, setDocs] = useState<DocPreview[]>([]);
    const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [status, setStatus] = useState("");
    const [limit, setLimit] = useState<number>(5);

    const fetchSample = async () => {
        if (!collection.trim()) {
            setStatus("コレクション名を入力してください");
            return;
        }
        setStatus("読み込み中...");
        try {
            const url = new URL('/api/test/field-rename', location.origin);
            url.searchParams.set('collection', collection.trim());
            if (subcollection) url.searchParams.set('subcollection', subcollection);
            url.searchParams.set('limit', String(limit || 5));
            const res = await fetch(url.toString());
            if (!res.ok) throw new Error(await res.text());
            const payload = await res.json();
            setDocs(payload.docs || []);
            // reset selection & mappings
            const sel: Record<string, boolean> = {};
            payload.docs?.forEach((d: any) => (sel[d.id] = true));
            setSelectedIds(sel);
            setMappings({});
            setStatus(`読み込み完了: ${payload.docs?.length || 0} 件`);
        } catch (err: any) {
            setStatus(String(err?.message || err));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const setFieldMapping = (oldName: string, newName: string) => {
        setMappings((prev) => ({ ...prev, [oldName]: newName }));
    };

    const previewPayload = () => {
        const target = docs.filter((d) => selectedIds[d.id]);
        const preview = target.map((d) => ({ id: d.id, changes: Object.entries(mappings).filter(([, v]) => v).map(([k, v]) => ({ from: k, to: v, value: d.data[k] })) }));
        return JSON.stringify(preview, null, 2);
    };

    const executeRename = async () => {
        const target = docs.filter((d) => selectedIds[d.id]);
        if (target.length === 0) {
            setStatus('少なくとも1件を選択してください');
            return;
        }
        const body = {
            collection: collection.trim(),
            subcollection: subcollection || undefined,
            docs: target.map((d) => ({ id: d.id, mappings })),
        };
        setStatus('実行中...');
        try {
            const res = await fetch('/api/test/field-rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await res.text());
            const result = await res.json();
            setStatus(`完了: 書き込み ${result.written || 0} 件, 失敗 ${result.failed?.length || 0} 件`);
            // refresh samples
            await fetchSample();
        } catch (err: any) {
            setStatus(String(err?.message || err));
        }
    };

    return (
        <main className="min-h-screen p-8 bg-gray-50">
            <div className="max-w-4xl mx-auto space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>フィールド名一括変更テスト</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                            <div>
                                <Label>コレクション名</Label>
                                <Input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="例: products_master" />
                            </div>
                            <div>
                                <Label>サブコレクション (任意)</Label>
                                <Input value={subcollection ?? ''} onChange={(e) => setSubcollection(e.target.value || null)} placeholder="例: terms" />
                            </div>
                            <div>
                                <Label>取得上限</Label>
                                <Input type="number" value={String(limit)} onChange={(e) => setLimit(Number(e.target.value || 5))} />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <Button onClick={fetchSample}>サンプル取得</Button>
                            <Button variant="destructive" onClick={() => { setDocs([]); setSelectedIds({}); setMappings({}); setStatus(''); }}>クリア</Button>
                        </div>

                        <div className="mt-4">
                            <div className="text-sm text-gray-600">ステータス: {status}</div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>サンプルドキュメント ({docs.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {docs.length === 0 ? (
                            <div className="text-sm text-gray-500">サンプルがありません。上で取得してください。</div>
                        ) : (
                            <div className="space-y-3">
                                {docs.map((d) => (
                                    <div key={d.id} className="border rounded p-3 bg-white">
                                        <div className="flex items-center justify-between">
                                            <div className="font-mono text-sm">{d.id}</div>
                                            <label className="flex items-center gap-2">
                                                <input type="checkbox" checked={!!selectedIds[d.id]} onChange={() => toggleSelect(d.id)} />
                                                選択
                                            </label>
                                        </div>
                                        <div className="mt-2 text-xs text-gray-700">
                                            {Object.keys(d.data).length === 0 ? (
                                                <div className="text-gray-400">フィールド無し</div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    {Object.keys(d.data).map((key) => (
                                                        <div key={key} className="flex items-center gap-2">
                                                            <div className="w-40 break-words text-sm">{key}</div>
                                                            <Input placeholder="新しいフィールド名" value={mappings[key] ?? ''} onChange={(e) => setFieldMapping(key, e.target.value)} />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <details className="mt-2 text-xs text-gray-600">
                                            <summary>ドキュメントデータを表示</summary>
                                            <pre className="bg-gray-100 p-2 rounded mt-2 text-xs overflow-auto">{JSON.stringify(d.data, null, 2)}</pre>
                                        </details>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>プレビュー / 実行</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-3">
                            <Label>プレビュー</Label>
                            <pre className="bg-gray-900 text-white p-3 rounded max-h-64 overflow-auto text-xs">{previewPayload()}</pre>
                        </div>
                        <div className="flex gap-3">
                            <Button onClick={executeRename}>実行: フィールド名を適用</Button>
                            <Button variant="outline" onClick={() => navigator.clipboard.writeText(previewPayload())}>プレビューをコピー</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
