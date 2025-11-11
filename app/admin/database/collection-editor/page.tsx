'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getFirestoreClient } from '@/lib/firestoreClient';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { useAdminAuthContext } from '@/contexts/AdminAuthContext';

// ツールチップコンポーネント
function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
    const [visible, setVisible] = useState(false);

    return (
        <div
            style={{ position: 'relative', display: 'inline-block' }}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {children}
            {visible && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: '8px',
                        padding: 'clamp(6px, 1vw, 12px) clamp(8px, 1.5vw, 16px)',
                        backgroundColor: '#333',
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: 'clamp(11px, 1.2vw, 14px)',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        maxWidth: 'min(90vw, 500px)',
                        width: 'max-content',
                        zIndex: 1000,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        lineHeight: '1.4',
                    }}
                >
                    {text.split('\n').map((line, i) => (
                        <span key={i}>
                            {line}
                            {i < text.split('\n').length - 1 && <br />}
                        </span>
                    ))}
                    <div
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 0,
                            height: 0,
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: '6px solid #333',
                        }}
                    />
                </div>
            )}
        </div>
    );
}

type FieldType = 'string' | 'number' | 'boolean' | 'map' | 'array' | 'null' | 'timestamp' | 'geopoint' | 'reference';

type TaxonomyField = {
    value: string;
    order: number;
    enabled: boolean;
    fieldType?: FieldType; // Firestoreに保存する際の型
    label?: string; // 表示名（内容(バリュー)）。保存時に label として永続化します
    children?: TaxonomyField[]; // mapやarray型の場合の子フィールド
    parentType?: FieldType; // 親フィールドの型（多重map防止用）
};

type TaxonomyDocument = {
    name: string;
    description: string;
    subCollections?: string[]; // サブコレクション名の配列
    subCollectionLabels?: Record<string, string>;
    fields: TaxonomyField[]; // フィールドの配列
    createdAt?: string;
    updatedAt?: string;
};

const DEFAULT_COLLECTION_NAME = 'taxonomies';
const DRAFT_STORAGE_KEY_PREFIX = 'firestore_draft_';

// よく使うコレクション名のプリセット
const COMMON_COLLECTIONS = [
    'taxonomies',
    'users',
    'products',
    'orders',
    'settings',
    'categories',
];

// 初期テンプレート
const INITIAL_TEMPLATES: Record<string, TaxonomyDocument> = {
    categories: {
        name: 'カテゴリー',
        description: '商品のカテゴリー分類',
        subCollections: [],
        subCollectionLabels: {},
        fields: [
            { value: 'pokemon', order: 1, enabled: true, fieldType: 'string', label: 'ポケモン' },
            { value: 'onepiece', order: 2, enabled: true, fieldType: 'string', label: 'ワンピース' },
            { value: 'dragonball', order: 3, enabled: true, fieldType: 'string', label: 'ドラゴンボール' },
            { value: 'figure', order: 4, enabled: true, fieldType: 'string', label: 'フィギュア' },
        ],
    },
    productTypes: {
        name: '商品種類',
        description: '商品の形態(Box、Pack、カートンなど)',
        subCollections: [],
        subCollectionLabels: {},
        fields: [
            { value: 'box', order: 1, enabled: true, fieldType: 'string', label: 'Box' },
            { value: 'pack', order: 2, enabled: true, fieldType: 'string', label: 'Pack' },
            { value: 'carton', order: 3, enabled: true, fieldType: 'string', label: 'カートン' },
            { value: 'single', order: 4, enabled: true, fieldType: 'string', label: 'シングルカード' },
            { value: 'piece', order: 5, enabled: true, fieldType: 'string', label: 'Piece' },
        ],
    },
    conditions: {
        name: '商品状態',
        description: '商品の状態(シュリンクあり、なしなど)',
        subCollections: [],
        subCollectionLabels: {},
        fields: [
            { value: 'shrink_yes', order: 1, enabled: true, fieldType: 'string', label: 'シュリンクあり' },
            { value: 'shrink_no', order: 2, enabled: true, fieldType: 'string', label: 'シュリンクなし' },
            { value: 'no_peri', order: 3, enabled: true, fieldType: 'string', label: 'ペリなし' },
            { value: 'new', order: 4, enabled: true, fieldType: 'string', label: '新品' },
            { value: 'used', order: 5, enabled: true, fieldType: 'string', label: '中古' },
        ],
    },
    statuses: {
        name: 'ステータス',
        description: '買取受付状態',
        subCollections: [],
        subCollectionLabels: {},
        fields: [
            { value: 'active', order: 1, enabled: true, fieldType: 'string', label: '受付中' },
            { value: 'suspended', order: 2, enabled: true, fieldType: 'string', label: '停止中' },
            { value: 'out_of_stock', order: 3, enabled: true, fieldType: 'string', label: '在庫なし' },
        ],
    },
};

export default function TaxonomiesPage() {
    // 認証状態を取得
    const { loading: authLoading, isAdmin, error: authError } = useAdminAuthContext();

    // コレクション選択
    const [collectionName, setCollectionName] = useState<string>(DEFAULT_COLLECTION_NAME);
    const [customCollectionName, setCustomCollectionName] = useState<string>('');
    const [showCustomInput, setShowCustomInput] = useState<boolean>(false);

    const [taxonomies, setTaxonomies] = useState<Record<string, TaxonomyDocument>>({});
    const [selectedDocId, setSelectedDocId] = useState<string>('');
    const [editingDoc, setEditingDoc] = useState<TaxonomyDocument | null>(null);
    // 選択されたサブコレクション名 ('' = ルートドキュメント)
    const [selectedSubCollection, setSelectedSubCollection] = useState<string>('');
    const [newDocId, setNewDocId] = useState('');
    // 現在選択しているサブコレクション用のラベル（編集用）
    const [subCollectionLabel, setSubCollectionLabel] = useState('');
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
    const [loading, setLoading] = useState(false);
    // 保存完了表示管理
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const saveTimerRef = useRef<number | null>(null);

    const markUserAction = () => {
        // ユーザー操作が発生したら保存完了表示を解除する
        if (saveStatus === 'saved') {
            setSaveStatus('idle');
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        }
    };

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, []);

    // LocalStorageから下書きを読み込む
    const loadDraft = useCallback(() => {
        if (typeof window === 'undefined') return null;
        try {
            const draft = localStorage.getItem(DRAFT_STORAGE_KEY_PREFIX + collectionName);
            return draft ? JSON.parse(draft) : null;
        } catch (error) {
            console.error('Draft load error:', error);
            return null;
        }
    }, [collectionName]);

    // LocalStorageに下書きを保存
    const saveDraft = useCallback((docId: string, doc: TaxonomyDocument) => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(DRAFT_STORAGE_KEY_PREFIX + collectionName, JSON.stringify({ docId, doc }));
        } catch (error) {
            console.error('Draft save error:', error);
        }
    }, [collectionName]);

    // LocalStorageから下書きを削除
    const clearDraft = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.removeItem(DRAFT_STORAGE_KEY_PREFIX + collectionName);
        } catch (error) {
            console.error('Draft clear error:', error);
        }
    }, [collectionName]);

    // 既存のドキュメントを読み込み
    const loadTaxonomies = useCallback(async () => {
        console.log('[loadTaxonomies] 開始', { collectionName });
        setLoading(true);
        try {
            // Firebase Auth の状態を確認
            const auth = await import('firebase/auth').then(m => m.getAuth());
            const currentUser = auth.currentUser;
            console.log('[loadTaxonomies] 現在の認証ユーザー:', {
                uid: currentUser?.uid,
                email: currentUser?.email,
                isAnonymous: currentUser?.isAnonymous
            });

            // トークンの詳細を取得（強制リフレッシュ）
            if (currentUser) {
                console.log('[loadTaxonomies] トークンを強制リフレッシュ中...');
                const tokenResult = await currentUser.getIdTokenResult(true); // 強制リフレッシュ
                console.log('[loadTaxonomies] トークン情報（リフレッシュ後）:', {
                    signInProvider: tokenResult.signInProvider,
                    claims: tokenResult.claims,
                    hasAdminClaim: tokenResult.claims?.admin === true,
                    token: tokenResult.token.substring(0, 50) + '...' // トークンの先頭部分のみ表示
                });

                // Firestore SDKに新しいトークンを確実に使わせるため、さらにトークンを明示的に取得
                await currentUser.getIdToken(true);
                console.log('[loadTaxonomies] Firestore用トークンも強制リフレッシュ完了');

                // Firestoreインスタンスを強制リセットして新しいトークンで再接続
                const { resetFirestoreInstance } = await import('@/lib/firestoreClient');
                resetFirestoreInstance();
                console.log('[loadTaxonomies] Firestoreインスタンスをリセット完了');

                // トークンがリフレッシュされた後、少し待機してFirestore SDKが新しいトークンを使用できるようにする
                await new Promise(resolve => setTimeout(resolve, 200));
            } else {
                console.error('[loadTaxonomies] ユーザーが未認証です');
                throw new Error('ユーザーが認証されていません');
            }

            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            console.log('[loadTaxonomies] Firestore getDocs を実行中...', { collectionName });
            const collectionRef = collection(db, collectionName);
            const snapshot = await getDocs(collectionRef);

            const data: Record<string, TaxonomyDocument> = {};
            snapshot.forEach((doc) => {
                data[doc.id] = doc.data() as TaxonomyDocument;
            });

            console.log('[loadTaxonomies] 読み込み成功', { count: snapshot.size });
            setTaxonomies(data);
            setMessage(`コレクション "${collectionName}" から ${snapshot.size}件のドキュメントを読み込みました`);
            setMessageType('success');
        } catch (error) {
            console.error('[loadTaxonomies] エラー詳細:', {
                error,
                errorType: error?.constructor?.name,
                errorCode: (error as any)?.code,
                errorMessage: (error as any)?.message,
                stack: (error as Error)?.stack
            });
            setMessage(`読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        } finally {
            setLoading(false);
            console.log('[loadTaxonomies] 終了');
        }
    }, [collectionName]);

    useEffect(() => {
        console.log('[useEffect] 実行', { authLoading, isAdmin, collectionName });

        // 認証が完了し、管理者権限がある場合のみデータを読み込む
        if (authLoading) {
            console.log('[useEffect] 認証確認中のため読み込みをスキップ');
            return; // 認証確認中は何もしない
        }

        if (!isAdmin) {
            console.log('[useEffect] 管理者権限がないため読み込みをスキップ', { authError });
            return; // 管理者でない場合は読み込まない
        }

        console.log('[useEffect] 認証完了、データ読み込み開始');
        loadTaxonomies();

        // 下書きがあれば復元
        const draft = loadDraft();
        if (draft) {
            const shouldRestore = confirm('未保存の編集内容があります。復元しますか?');
            if (shouldRestore) {
                setSelectedDocId('__new__');
                setNewDocId(draft.docId);
                setEditingDoc(draft.doc);
                setMessage('下書きを復元しました');
                setMessageType('info');
            } else {
                clearDraft();
            }
        }
    }, [collectionName, loadTaxonomies, loadDraft, clearDraft, authLoading, isAdmin, authError]); // 認証状態も依存関係に追加

    // コレクション変更時の処理
    const handleCollectionChange = (newCollection: string) => {
        if (newCollection === '__custom__') {
            setShowCustomInput(true);
            return;
        }

        // 編集中の内容があれば警告
        if (editingDoc && selectedDocId) {
            const confirmed = confirm('編集中の内容は保存されていません。コレクションを変更しますか?');
            if (!confirmed) return;
        }

        setCollectionName(newCollection);
        setSelectedDocId('');
        setEditingDoc(null);
        setSelectedSubCollection('');
        setTaxonomies({});
        setShowCustomInput(false);
    };

    // カスタムコレクション名の適用
    const handleApplyCustomCollection = () => {
        if (!customCollectionName.trim()) {
            alert('コレクション名を入力してください');
            return;
        }

        setCollectionName(customCollectionName.trim());
        setSelectedDocId('');
        setEditingDoc(null);
        setSelectedSubCollection('');
        setTaxonomies({});
        setShowCustomInput(false);
        setCustomCollectionName('');
    };

    // ドキュメントを選択
    const handleSelectDoc = async (docId: string) => {
        markUserAction();
        setSelectedDocId(docId);
        // ルートのサブコレクション選択をリセット
        setSelectedSubCollection('');
        setSubCollectionLabel('');

        if (taxonomies[docId]) {
            const docData = taxonomies[docId];
            setEditingDoc({
                name: docData.name || '',
                description: docData.description || '',
                subCollections: docData.subCollections || [],
                subCollectionLabels: docData.subCollectionLabels || {},
                fields: docData.fields || [], // fieldsがない場合は空配列を設定
                createdAt: docData.createdAt,
                updatedAt: docData.updatedAt,
            });
        } else {
            setEditingDoc(null);
        }
    };

    // 新規ドキュメント作成
    const handleCreateNew = () => {
        markUserAction();
        clearDraft(); // 既存の下書きをクリア
        setSelectedDocId('__new__');
        setSelectedSubCollection(''); // サブコレクション選択をリセット
        setEditingDoc({
            name: '',
            description: '',
            subCollections: [],
            fields: [],
        });
        setNewDocId('');
    };

    // テンプレートから作成
    const handleUseTemplate = (templateKey: string) => {
        markUserAction();
        clearDraft(); // 既存の下書きをクリア
        const template = INITIAL_TEMPLATES[templateKey];
        setSelectedDocId('__new__');
        setSelectedSubCollection(''); // サブコレクション選択をリセット
        setNewDocId(templateKey);
        setEditingDoc({ ...template });
    };

    // フィールドを追加
    const handleAddField = () => {
        markUserAction();
        if (!editingDoc) return;

        const newField: TaxonomyField = {
            value: '',
            order: editingDoc.fields.length + 1,
            enabled: true,
            fieldType: 'string', // デフォルトは文字列
            label: '',
            children: [],
        };

        const updatedDoc = {
            ...editingDoc,
            fields: [...editingDoc.fields, newField],
        };

        setEditingDoc(updatedDoc);

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        }
    };

    // 子フィールドを追加
    const handleAddChildField = (parentIndex: number, parentType: FieldType) => {
        markUserAction();
        if (!editingDoc) return;

        const newFields = [...editingDoc.fields];
        const parentField = newFields[parentIndex];

        if (!parentField.children) {
            parentField.children = [];
        }

        const newChildField: TaxonomyField = {
            value: '',
            order: parentField.children.length + 1,
            enabled: true,
            // 子要素の型はスカラ型から選べるようにする（デフォルトは string）。map/array は選択不可。
            fieldType: 'string',
            label: '',
            children: [],
            parentType: parentType,
        };

        parentField.children.push(newChildField);

        const updatedDoc = {
            ...editingDoc,
            fields: newFields,
        };

        setEditingDoc(updatedDoc);

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        }
    };

    // 子フィールドを更新
    const handleUpdateChildField = (parentIndex: number, childIndex: number, updates: Partial<TaxonomyField>) => {
        markUserAction();
        if (!editingDoc) return;

        const newFields = [...editingDoc.fields];
        const parentField = newFields[parentIndex];

        if (parentField.children && parentField.children[childIndex]) {
            parentField.children[childIndex] = { ...parentField.children[childIndex], ...updates };
        }

        const updatedDoc = {
            ...editingDoc,
            fields: newFields,
        };

        setEditingDoc(updatedDoc);

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        }
    };

    // 子フィールドを削除
    const handleDeleteChildField = (parentIndex: number, childIndex: number) => {
        markUserAction();
        if (!editingDoc) return;

        const newFields = [...editingDoc.fields];
        const parentField = newFields[parentIndex];

        if (parentField.children) {
            parentField.children = parentField.children.filter((_, i) => i !== childIndex);
        }

        const updatedDoc = {
            ...editingDoc,
            fields: newFields,
        };

        setEditingDoc(updatedDoc);

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        }
    };

    // サブコレクションを追加
    const handleAddSubCollection = () => {
        markUserAction();
        if (!editingDoc) return;

        const subCollectionName = prompt('サブコレクション名を入力してください（例: types, states）:');
        if (!subCollectionName || !subCollectionName.trim()) return;

        const trimmedName = subCollectionName.trim();

        // 既に存在するかチェック
        if (editingDoc.subCollections?.includes(trimmedName)) {
            alert(`サブコレクション "${trimmedName}" は既に存在します`);
            return;
        }

        const updatedDoc = {
            ...editingDoc,
            subCollections: [...(editingDoc.subCollections || []), trimmedName],
            subCollectionLabels: { ...(editingDoc.subCollectionLabels || {}), [trimmedName]: '' },
        };

        setEditingDoc(updatedDoc);

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        }

        setMessage(`サブコレクション "${trimmedName}" を追加しました`);
        setMessageType('info');
    };

    // サブコレクションを選択（'' はルートドキュメントを意味する）
    const handleSelectSubCollection = async (subName: string) => {
        markUserAction();
        if (!editingDoc) return;

        setSelectedSubCollection(subName);

        // ルートを選択した場合
        if (!subName) {
            // ルートへ戻る場合はサブコレクションラベルをクリア
            setSubCollectionLabel('');
            // 新規作成中は現在の編集内容（下書き）をそのまま表示
            if (selectedDocId === '__new__') {
                setEditingDoc({ ...editingDoc });
            } else if (taxonomies[selectedDocId]) {
                setEditingDoc({ ...taxonomies[selectedDocId] });
            }
            return;
        }

        // サブコレクション選択: 新規作成中はローカルの編集内容を使ってそのまま編集可能にする
        if (selectedDocId === '__new__') {
            const updatedDoc = {
                ...editingDoc,
                fields: editingDoc.fields || [],
                subCollections: editingDoc.subCollections || [],
                subCollectionLabels: editingDoc.subCollectionLabels || {},
            };

            setEditingDoc(updatedDoc);
            setSubCollectionLabel((updatedDoc.subCollectionLabels || {})[subName] || '');

            setMessage(`サブコレクション "${subName}" をローカルで編集しています（保存すると一括で反映されます）`);
            setMessageType('info');
            return;
        }

        // 既存ドキュメントのサブコレクションを選択した場合、Firestoreから読み込む
        try {
            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            if (!selectedDocId) {
                setMessage('親ドキュメントを選択してください');
                setMessageType('error');
                return;
            }

            // サブコレクション配下の全ドキュメントを取得（各ドキュメント = 1フィールド）
            const subColRef = collection(db, collectionName, selectedDocId, subName);
            const snapshot = await getDocs(subColRef);

            const fields: TaxonomyField[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                fields.push({
                    value: docSnap.id, // ドキュメントIDがvalue
                    order: data.order || 0,
                    enabled: data.enabled !== undefined ? data.enabled : true,
                    fieldType: data.fieldType || 'string',
                    // サブコレクションでは表示名は label として保存される
                    label: data.label !== undefined ? data.label : '',
                });
            });

            // orderでソート
            fields.sort((a, b) => a.order - b.order);

            // 親ドキュメントの情報を基に fields を差し替える形で編集状態を更新（ドキュメント名は上書きしない）
            const parent = taxonomies[selectedDocId] || { name: '', description: '', subCollections: [], fields: [], subCollectionLabels: {} } as TaxonomyDocument;
            setEditingDoc({
                ...parent,
                subCollections: parent.subCollections || editingDoc.subCollections || [],
                fields,
            });

            setSubCollectionLabel((parent.subCollectionLabels || {})[subName] || '');

            setMessage(`サブコレクション "${subName}" から ${fields.length}件のフィールドを読み込みました`);
            setMessageType('success');
        } catch (error) {
            console.error('Load subcollection error:', error);
            setMessage(`サブコレクション読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        }
    };



    // サブコレクション内の全ドキュメントをコピーする補助関数
    const copySubCollectionDocs = async (
        db: any,
        parentDocPath: string,
        oldSubCollName: string,
        newSubCollName: string
    ): Promise<number> => {
        const oldSubColRef = collection(db, collectionName, parentDocPath, oldSubCollName);
        const snapshot = await getDocs(oldSubColRef);
        let copiedCount = 0;

        for (const docSnap of snapshot.docs) {
            const newDocRef = doc(db, collectionName, parentDocPath, newSubCollName, docSnap.id);
            await setDoc(newDocRef, docSnap.data());
            copiedCount++;
        }

        return copiedCount;
    };

    // サブコレクション内の全ドキュメントを削除する補助関数
    const deleteSubCollectionDocs = async (
        db: any,
        parentDocPath: string,
        subCollName: string
    ): Promise<number> => {
        const subColRef = collection(db, collectionName, parentDocPath, subCollName);
        const snapshot = await getDocs(subColRef);
        let deletedCount = 0;

        for (const docSnap of snapshot.docs) {
            await deleteDoc(docSnap.ref);
            deletedCount++;
        }

        return deletedCount;
    };

    // サブコレクション名をリネーム（データも移動）
    const handleRenameSubCollection = async (oldName: string) => {
        markUserAction();
        if (!editingDoc) return;

        const newNameInput = prompt(`サブコレクション名を編集: "${oldName}" →`, oldName);
        if (!newNameInput) return;
        const newName = newNameInput.trim();
        if (!newName) return;
        if (newName === oldName) return;

        // 重複チェック
        const exists = (editingDoc.subCollections || []).some((n) => n === newName);
        if (exists) {
            alert(`サブコレクション "${newName}" は既に存在します`);
            return;
        }

        // ローカル更新
        const updatedSubCollections = (editingDoc.subCollections || []).map((n) => (n === oldName ? newName : n));
        const updatedLabels = { ...(editingDoc.subCollectionLabels || {}) } as Record<string, string>;
        if (Object.prototype.hasOwnProperty.call(updatedLabels, oldName)) {
            updatedLabels[newName] = updatedLabels[oldName];
            delete updatedLabels[oldName];
        }

        const updatedDoc: TaxonomyDocument = {
            ...editingDoc,
            subCollections: updatedSubCollections,
            subCollectionLabels: updatedLabels,
        };

        setEditingDoc(updatedDoc);

        // 選択状態の更新
        if (selectedSubCollection === oldName) {
            setSelectedSubCollection(newName);
            setSubCollectionLabel(updatedLabels[newName] || '');
        }

        // 新規ドキュメントなら下書き保存のみ
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
            setMessage(`サブコレクション名を "${oldName}" から "${newName}" に変更しました（ローカル）`);
            setMessageType('info');
            return;
        }

        // 既存ドキュメントならデータ移動を実行
        try {
            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            const proceed = confirm(
                `サブコレクション名を "${oldName}" から "${newName}" に変更します。\n\n` +
                `以下の処理が実行されます:\n` +
                `1. ${collectionName}/${selectedDocId}/${oldName} の全ドキュメントを\n` +
                `   ${collectionName}/${selectedDocId}/${newName} にコピー\n` +
                `2. 旧サブコレクション ${oldName} のドキュメントを削除\n` +
                `3. 親ドキュメントのリンク情報を更新\n\n` +
                `続行しますか？`
            );
            if (!proceed) return;

            setMessage('サブコレクションの名前変更を実行中...');
            setMessageType('info');

            // 1. 新しいサブコレクションにドキュメントをコピー
            const copiedCount = await copySubCollectionDocs(db, selectedDocId, oldName, newName);

            // 2. 古いサブコレクションのドキュメントを削除
            const deletedCount = await deleteSubCollectionDocs(db, selectedDocId, oldName);

            // 3. 親ドキュメントのメタデータを更新
            const parentRef = doc(db, collectionName, selectedDocId);
            await setDoc(
                parentRef,
                {
                    subCollections: updatedSubCollections,
                    subCollectionLabels: updatedLabels,
                    updatedAt: new Date().toISOString()
                },
                { merge: true }
            );

            // ローカルキャッシュ更新
            await loadTaxonomies();

            setMessage(
                `サブコレクション名を "${oldName}" から "${newName}" に変更しました\n` +
                `（${copiedCount}件のドキュメントを移動、${deletedCount}件を削除）`
            );
            setMessageType('success');
        } catch (error) {
            console.error('Rename subcollection error:', error);
            setMessage(`サブコレクション名変更エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        }
    };

    // サブコレクションを削除
    const handleDeleteSubCollection = async (subCollectionName: string) => {
        markUserAction();
        if (!editingDoc) return;

        const confirmed = confirm(
            `サブコレクション "${subCollectionName}" を削除しますか？\n\n注意: Firestore上の実際のサブコレクションデータは削除されません。リンクのみが削除されます。`
        );

        if (!confirmed) return;

        const updatedLabels = { ...(editingDoc.subCollectionLabels || {}) } as Record<string, string>;
        delete updatedLabels[subCollectionName];

        const updatedDoc = {
            ...editingDoc,
            subCollections: (editingDoc.subCollections || []).filter(name => name !== subCollectionName),
            subCollectionLabels: updatedLabels,
        };

        setEditingDoc(updatedDoc);

        // 削除したサブコレクションが選択されていた場合はルートに戻る
        if (selectedSubCollection === subCollectionName) {
            setSelectedSubCollection('');
            // ルートのデータを復元
            if (selectedDocId !== '__new__' && taxonomies[selectedDocId]) {
                setEditingDoc({ ...taxonomies[selectedDocId], subCollections: updatedDoc.subCollections });
            }
        }

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        } else {
            // 既存ドキュメントなら親ドキュメントの subCollections を即時更新しておく
            try {
                const db = getFirestoreClient();
                if (!db) throw new Error('Firestoreの初期化に失敗しました');
                const parentRef = doc(db, collectionName, selectedDocId);
                // 既存のラベルマップを更新して削除したキーを除外
                await setDoc(parentRef, { subCollections: updatedDoc.subCollections, subCollectionLabels: updatedLabels }, { merge: true });
                // ローカルキャッシュを更新
                await loadTaxonomies();
                setMessage(`サブコレクション "${subCollectionName}" を削除しました（Firestore 反映済み）`);
                setMessageType('success');
            } catch (error) {
                console.error('Delete subcollection link error:', error);
                setMessage(`サブコレクション削除エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
                setMessageType('error');
            }
        }

        if (selectedDocId === '__new__') {
            setMessage(`サブコレクション "${subCollectionName}" を削除しました`);
            setMessageType('info');
        }
    };

    // フィールドを更新
    const handleUpdateField = (index: number, updates: Partial<TaxonomyField>) => {
        markUserAction();
        if (!editingDoc) return;

        const newFields = [...editingDoc.fields];
        newFields[index] = { ...newFields[index], ...updates };

        const updatedDoc = {
            ...editingDoc,
            fields: newFields,
        };

        setEditingDoc(updatedDoc);

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        }
    };

    // フィールドを削除
    const handleDeleteField = (index: number) => {
        markUserAction();
        if (!editingDoc) return;

        const newFields = editingDoc.fields.filter((_, i) => i !== index);

        const updatedDoc = {
            ...editingDoc,
            fields: newFields,
        };

        setEditingDoc(updatedDoc);

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        }
    };

    // フィールドの順序を変更
    const handleMoveField = (index: number, direction: 'up' | 'down') => {
        markUserAction();
        if (!editingDoc) return;

        const newFields = [...editingDoc.fields];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= newFields.length) return;

        [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];

        // order を再設定
        newFields.forEach((field, i) => {
            field.order = i + 1;
        });

        const updatedDoc = {
            ...editingDoc,
            fields: newFields,
        };

        setEditingDoc(updatedDoc);

        // 新規ドキュメントの場合は下書きを保存
        if (selectedDocId === '__new__') {
            saveDraft(newDocId, updatedDoc);
        }
    };

    // ドキュメントを保存
    const handleSave = async () => {
        if (!editingDoc) return;

        const docId = selectedDocId === '__new__' ? newDocId : selectedDocId;

        if (!docId.trim()) {
            setMessage('ドキュメントIDを入力してください');
            setMessageType('error');
            return;
        }

        if (!editingDoc.name.trim()) {
            setMessage('名前を入力してください');
            setMessageType('error');
            return;
        }

        try {
            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            const now = new Date().toISOString();

            // ...existing code...

            const dataToSave: TaxonomyDocument = {
                ...editingDoc,
                updatedAt: now,
            };

            // 新規作成の場合はcreatedAtも設定
            if (selectedDocId === '__new__' || !editingDoc.createdAt) {
                dataToSave.createdAt = now;
            }

            // サブコレクションを選択している場合は各フィールドを個別ドキュメントとして保存
            if (selectedSubCollection) {
                // サブコレクション内の差分保存: 既存ドキュメントを全削除せず、追加・更新・削除だけ行う
                const subColRef = collection(db, collectionName, docId, selectedSubCollection);
                const existingSnapshot = await getDocs(subColRef);
                const existingIds = existingSnapshot.docs.map(d => d.id);
                const newIds = editingDoc.fields.map(f => f.value);

                // Decide which docs to delete (present before, missing now)
                const idsToDelete = existingIds.filter(id => !newIds.includes(id));

                // Upsert (add or update) documents for each field
                const upsertPromises = editingDoc.fields.map((field) => {
                    const fieldDocRef = doc(db, collectionName, docId, selectedSubCollection, field.value);
                    return setDoc(fieldDocRef, {
                        order: field.order,
                        enabled: field.enabled,
                        fieldType: field.fieldType || 'string',
                        // サブコレクションでは label として保存
                        label: (field as any).label || '',
                        updatedAt: now,
                    }, { merge: true });
                });

                // Delete removed documents
                const deletePromises = idsToDelete.map(id => deleteDoc(doc(db, collectionName, docId, selectedSubCollection, id)));

                await Promise.all([...upsertPromises, ...deletePromises]);

                // 親ドキュメントに name, description, subCollections と subCollectionLabels の情報を永続化（リロード後も編集対象に表示させるため）
                try {
                    const parentRef = doc(db, collectionName, docId);
                    const labels = { ...(editingDoc.subCollectionLabels || {}), [selectedSubCollection]: subCollectionLabel };
                    await setDoc(parentRef, {
                        name: editingDoc.name,
                        description: editingDoc.description,
                        subCollections: editingDoc.subCollections || [],
                        subCollectionLabels: labels,
                        updatedAt: now
                    }, { merge: true });
                } catch (err) {
                    console.error('Failed to update parent doc:', err);
                }

                setMessage(`サブコレクション "${selectedSubCollection}" に ${editingDoc.fields.length}件のフィールドを保存しました`);
            } else {
                // ルートドキュメントに保存（フィールドの表示名は label として保存）
                const fieldsWithLabels = editingDoc.fields.map(field => ({
                    ...field,
                    label: (field as any).label || '',
                }));

                const docRef = doc(db, collectionName, docId);
                // マップ型的にマージして保存（既存の他フィールドを上書きしない）
                await setDoc(docRef, {
                    ...dataToSave,
                    fields: fieldsWithLabels,
                }, { merge: true });
                setMessage(`ドキュメント "${docId}" を保存しました`);
            }

            setMessageType('success');

            // 下書きをクリア
            clearDraft();

            // リロード
            await loadTaxonomies();
            setSelectedDocId(docId);

            // サブコレクションを選択していた場合は、保存後にフィールドを再読み込み
            if (selectedSubCollection) {
                await handleSelectSubCollection(selectedSubCollection);
            }
            // 保存完了表示を出す（3秒）
            setSaveStatus('saved');
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = window.setTimeout(() => {
                setSaveStatus('idle');
                saveTimerRef.current = null;
            }, 3000);
        } catch (error) {
            console.error('Save error:', error);
            setMessage(`保存エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        }
    };

    // ドキュメントを削除
    const handleDelete = async () => {
        markUserAction();
        if (!selectedDocId || selectedDocId === '__new__') return;

        const confirmed = confirm(
            `ドキュメント "${selectedDocId}" を削除しますか？\n\nこの操作は取り消せません。`
        );

        if (!confirmed) return;

        try {
            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            const docRef = doc(db, collectionName, selectedDocId);
            await deleteDoc(docRef);

            setMessage(`ドキュメント "${selectedDocId}" を削除しました`);
            setMessageType('success');

            setSelectedDocId('');
            setEditingDoc(null);

            await loadTaxonomies();
        } catch (error) {
            console.error('Delete error:', error);
            setMessage(`削除エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        }
    };

    // 認証確認中の表示
    if (authLoading) {
        return (
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
                <div style={{ marginBottom: '20px' }}>
                    <Link href="/" style={{ color: '#007bff', textDecoration: 'underline' }}>
                        ← トップページに戻る
                    </Link>
                </div>
                <h1 style={{ fontSize: '2rem', marginBottom: '24px' }}>Firestore コレクション管理</h1>
                <div style={{
                    padding: '40px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    textAlign: 'center'
                }}>
                    <p style={{ fontSize: '1.2rem', color: '#666' }}>認証状態を確認中...</p>
                </div>
            </div>
        );
    }

    // 管理者権限がない場合の表示
    if (!isAdmin) {
        return (
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
                <div style={{ marginBottom: '20px' }}>
                    <Link href="/" style={{ color: '#007bff', textDecoration: 'underline' }}>
                        ← トップページに戻る
                    </Link>
                </div>
                <h1 style={{ fontSize: '2rem', marginBottom: '24px' }}>Firestore コレクション管理</h1>
                <div style={{
                    padding: '40px',
                    backgroundColor: '#f8d7da',
                    borderRadius: '8px',
                    border: '1px solid #f5c6cb',
                    textAlign: 'center'
                }}>
                    <p style={{ fontSize: '1.2rem', color: '#721c24', marginBottom: '12px' }}>
                        アクセス権限がありません
                    </p>
                    <p style={{ fontSize: '1rem', color: '#721c24' }}>
                        {authError || '管理者権限が必要です'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
                <Link href="/" style={{ color: '#007bff', textDecoration: 'underline' }}>
                    ← トップページに戻る
                </Link>
            </div>

            <h1 style={{ fontSize: '2rem', marginBottom: '24px' }}>Firestore コレクション管理</h1>

            {/* コレクション選択 */}
            <div style={{
                marginBottom: '24px',
                padding: '20px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '2px solid #007bff'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <label style={{ fontWeight: '600', fontSize: '1rem', minWidth: '120px' }}>
                        📁 コレクション:
                    </label>
                    <select
                        value={showCustomInput ? '__custom__' : collectionName}
                        onChange={(e) => handleCollectionChange(e.target.value)}
                        style={{
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: '1px solid #ced4da',
                            fontSize: '14px',
                            minWidth: '200px',
                            cursor: 'pointer',
                        }}
                    >
                        {COMMON_COLLECTIONS.map(col => (
                            <option key={col} value={col}>{col}</option>
                        ))}
                        <option value="__custom__">➕ カスタム...</option>
                    </select>

                    {showCustomInput && (
                        <>
                            <input
                                type="text"
                                value={customCollectionName}
                                onChange={(e) => setCustomCollectionName(e.target.value)}
                                placeholder="コレクション名を入力"
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid #ced4da',
                                    fontSize: '14px',
                                    minWidth: '200px',
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleApplyCustomCollection();
                                    }
                                }}
                            />
                            <button
                                onClick={handleApplyCustomCollection}
                                style={{
                                    padding: '10px 20px',
                                    backgroundColor: '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                }}
                            >
                                適用
                            </button>
                            <button
                                onClick={() => {
                                    setShowCustomInput(false);
                                    setCustomCollectionName('');
                                }}
                                style={{
                                    padding: '10px 20px',
                                    backgroundColor: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                }}
                            >
                                キャンセル
                            </button>
                        </>
                    )}

                    {!showCustomInput && (
                        <div style={{
                            marginLeft: 'auto',
                            padding: '8px 16px',
                            backgroundColor: '#e7f3ff',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            color: '#0056b3'
                        }}>
                            現在: <strong>{collectionName}</strong>
                        </div>
                    )}
                </div>
            </div>

            {/* メッセージ表示 */}
            {message && (
                <div
                    style={{
                        padding: '12px',
                        marginBottom: '20px',
                        backgroundColor:
                            messageType === 'success'
                                ? '#d4edda'
                                : messageType === 'error'
                                    ? '#f8d7da'
                                    : '#d1ecf1',
                        border: `1px solid ${messageType === 'success'
                            ? '#c3e6cb'
                            : messageType === 'error'
                                ? '#f5c6cb'
                                : '#bee5eb'
                            }`,
                        borderRadius: '6px',
                        color:
                            messageType === 'success'
                                ? '#155724'
                                : messageType === 'error'
                                    ? '#721c24'
                                    : '#0c5460',
                    }}
                >
                    {message}
                </div>
            )}

            <div style={{ display: 'flex', gap: '24px' }}>
                {/* 左側：ドキュメント一覧 */}
                <div style={{ flex: '0 0 300px' }}>
                    <div
                        style={{
                            padding: '20px',
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            border: '1px solid #dee2e6',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>ドキュメント一覧</h2>
                            <button
                                onClick={loadTaxonomies}
                                disabled={loading}
                                style={{
                                    padding: '6px 12px',
                                    backgroundColor: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                }}
                            >
                                {loading ? '読込中...' : '更新'}
                            </button>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <button
                                onClick={handleCreateNew}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                }}
                            >
                                ➕ 新規作成
                            </button>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <p style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '8px', color: '#666' }}>
                                テンプレートから作成:
                            </p>
                            {Object.entries(INITIAL_TEMPLATES).map(([key, template]) => (
                                <button
                                    key={key}
                                    onClick={() => handleUseTemplate(key)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        marginBottom: '6px',
                                        backgroundColor: '#f8f9fa',
                                        border: '1px solid #dee2e6',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        textAlign: 'left',
                                    }}
                                >
                                    📋 {template.name}
                                </button>
                            ))}
                        </div>

                        <div style={{ borderTop: '1px solid #dee2e6', paddingTop: '16px' }}>
                            <p style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '8px', color: '#666' }}>
                                既存のドキュメント ({Object.keys(taxonomies).length}件):
                            </p>
                            {Object.keys(taxonomies).length === 0 ? (
                                <p style={{ fontSize: '0.85rem', color: '#999', fontStyle: 'italic' }}>
                                    ドキュメントがありません
                                </p>
                            ) : (
                                Object.keys(taxonomies).map((docId) => (
                                    <button
                                        key={docId}
                                        onClick={() => handleSelectDoc(docId)}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            marginBottom: '6px',
                                            backgroundColor: selectedDocId === docId ? '#007bff' : 'white',
                                            color: selectedDocId === docId ? 'white' : '#333',
                                            border: `1px solid ${selectedDocId === docId ? '#0056b3' : '#dee2e6'}`,
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            textAlign: 'left',
                                        }}
                                    >
                                        <div style={{ fontWeight: '600' }}>{taxonomies[docId].name}</div>
                                        <div style={{ fontSize: '0.85rem', marginTop: '4px', opacity: 0.8 }}>
                                            ID: {docId}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* 右側：編集エリア */}
                <div style={{ flex: 1 }}>
                    {!editingDoc ? (
                        <div
                            style={{
                                padding: '60px',
                                backgroundColor: 'white',
                                borderRadius: '8px',
                                border: '1px solid #dee2e6',
                                textAlign: 'center',
                                color: '#999',
                            }}
                        >
                            <p style={{ fontSize: '1.2rem' }}>
                                左側からドキュメントを選択するか、<br />
                                新規作成してください
                            </p>
                        </div>
                    ) : (
                        <div
                            style={{
                                padding: '24px',
                                backgroundColor: 'white',
                                borderRadius: '8px',
                                border: '1px solid #dee2e6',
                            }}
                        >
                            {/* ドキュメントID */}
                            {selectedDocId === '__new__' && (
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                                        ドキュメントID *
                                    </label>
                                    <input
                                        type="text"
                                        value={newDocId}
                                        onChange={(e) => {
                                            markUserAction();
                                            setNewDocId(e.target.value);
                                            // 下書きを更新
                                            if (editingDoc) {
                                                saveDraft(e.target.value, editingDoc);
                                            }
                                        }}
                                        placeholder="例: categories, productTypes"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ced4da',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                        }}
                                    />
                                    <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                                        英数字とアンダースコアのみ使用可能
                                    </p>
                                </div>
                            )}

                            {selectedDocId !== '__new__' && (
                                <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                                        ドキュメントID: <strong>{selectedDocId}</strong>
                                    </p>
                                </div>
                            )}

                            {/* ドキュメント名 */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                                    ドキュメント名 *
                                </label>
                                <input
                                    type="text"
                                    value={editingDoc.name || ''}
                                    onChange={(e) => {
                                        markUserAction();
                                        const updatedDoc = { ...editingDoc, name: e.target.value };
                                        setEditingDoc(updatedDoc);
                                        // 新規ドキュメントの場合は下書きを保存
                                        if (selectedDocId === '__new__') {
                                            saveDraft(newDocId, updatedDoc);
                                        }
                                    }}
                                    placeholder="例: カテゴリー、商品種類"
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        border: '1px solid #ced4da',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                    }}
                                />
                            </div>

                            {/* 説明 */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                                    説明
                                </label>
                                <textarea
                                    value={editingDoc.description || ''}
                                    onChange={(e) => {
                                        markUserAction();
                                        const updatedDoc = { ...editingDoc, description: e.target.value };
                                        setEditingDoc(updatedDoc);
                                        // 新規ドキュメントの場合は下書きを保存
                                        if (selectedDocId === '__new__') {
                                            saveDraft(newDocId, updatedDoc);
                                        }
                                    }}
                                    placeholder="このタクソノミーの説明"
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        border: '1px solid #ced4da',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        resize: 'vertical',
                                        minHeight: '80px',
                                    }}
                                />
                            </div>

                            {/* サブコレクション */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <label style={{ fontWeight: '600' }}>サブコレクション</label>
                                    <button
                                        onClick={handleAddSubCollection}
                                        style={{
                                            padding: '6px 12px',
                                            backgroundColor: '#17a2b8',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                        }}
                                    >
                                        ➕ サブコレクション追加
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '12px' }}>
                                    {selectedDocId === '__new__'
                                        ? `保存後、${collectionName}/{newDocId || 'ドキュメントID'}/{サブコレクション名}/{フィールドvalue} として作成されます`
                                        : `${collectionName}/${selectedDocId}/{サブコレクション名}/{フィールドvalue} として作成されます`}
                                </p>
                                {/* サブコレクション選択: ルート or 各サブコレクション */}
                                <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 600, marginRight: '6px' }}>編集対象:</label>
                                    <select
                                        value={selectedSubCollection}
                                        onChange={(e) => handleSelectSubCollection(e.target.value)}
                                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '14px' }}
                                    >
                                        <option value="">-- ドキュメント直下 (Root) --</option>
                                        {(editingDoc.subCollections || []).map((name) => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* サブコレクション専用ラベル（サブコレクション選択時に表示） */}
                                {selectedSubCollection ? (
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                                            サブコレクションラベル (表示名)
                                        </label>
                                        <input
                                            type="text"
                                            value={subCollectionLabel}
                                            onChange={(e) => {
                                                markUserAction();
                                                const val = e.target.value;
                                                setSubCollectionLabel(val);
                                                // 新規ドキュメントでは編集Docに反映して下書きも更新
                                                if (selectedDocId === '__new__' && editingDoc) {
                                                    const updatedDoc = { ...editingDoc, subCollectionLabels: { ...(editingDoc.subCollectionLabels || {}), [selectedSubCollection]: val } };
                                                    setEditingDoc(updatedDoc);
                                                    saveDraft(newDocId, updatedDoc);
                                                }
                                            }}
                                            placeholder="サブコレクションの表示名を入力"
                                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '14px', width: '100%' }}
                                        />
                                    </div>
                                ) : null}

                                {!editingDoc.subCollections || editingDoc.subCollections.length === 0 ? (
                                    <p style={{ fontSize: '0.9rem', color: '#999', fontStyle: 'italic', textAlign: 'center', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                                        サブコレクションがありません
                                    </p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {editingDoc.subCollections.map((subColName) => (
                                            <div
                                                key={subColName}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '12px',
                                                    backgroundColor: '#e7f3ff',
                                                    border: '1px solid #b3d9ff',
                                                    borderRadius: '6px',
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                                                        📁 {subColName}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#666', fontFamily: 'monospace' }}>
                                                        {selectedDocId === '__new__'
                                                            ? `${collectionName}/{${newDocId || 'ドキュメントID'}}/${subColName}/{フィールドvalue}`
                                                            : `${collectionName}/${selectedDocId}/${subColName}/{フィールドvalue}`}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        onClick={() => handleRenameSubCollection(subColName)}
                                                        style={{
                                                            padding: '6px 12px',
                                                            backgroundColor: '#6c757d',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '12px',
                                                        }}
                                                    >
                                                        編集
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSubCollection(subColName)}
                                                        style={{
                                                            padding: '6px 12px',
                                                            backgroundColor: '#dc3545',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '12px',
                                                        }}
                                                    >
                                                        削除
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* フィールド */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <Tooltip text={'フィールド: 項目一覧を編集します。サブコレクションを選択するとその配下の項目を編集できます。'}>
                                        <label style={{ fontWeight: '600', cursor: 'help' }}>
                                            フィールド {selectedSubCollection && `(サブコレクション: ${selectedSubCollection})`}
                                        </label>
                                    </Tooltip>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <Tooltip text={'内容(バリュー): 実際に保存される具体的な値を書きます（例: "ポケモン", 100, {"lat":..}）。\nデータ型（タイプ）: この項目にどのような形式の値を保存するかを決めます（文字列、数値、日時、グループ、リスト等）。\n項目（フィールド）: システム内で使う識別名です（例: pokemon）。'}>
                                            <button
                                                style={{
                                                    padding: '6px 10px',
                                                    backgroundColor: '#17a2b8',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '50%',
                                                    cursor: 'help',
                                                    fontSize: '14px',
                                                    width: '32px',
                                                    height: '32px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                                aria-label="フィールドの使い方"
                                            >
                                                ℹ️
                                            </button>
                                        </Tooltip>
                                        <button
                                            onClick={handleAddField}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: '#007bff',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                            }}
                                        >
                                            ➕ フィールド追加
                                        </button>
                                    </div>
                                </div>

                                {!editingDoc.fields || editingDoc.fields.length === 0 ? (
                                    <p style={{ fontSize: '0.9rem', color: '#999', fontStyle: 'italic', textAlign: 'center', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                                        フィールドがありません。「フィールド追加」ボタンで追加してください。
                                    </p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {editingDoc.fields.map((field, index) => (
                                            <div
                                                key={index}
                                                style={{
                                                    padding: '16px',
                                                    backgroundColor: '#f8f9fa',
                                                    border: '1px solid #dee2e6',
                                                    borderRadius: '6px',
                                                }}
                                            >
                                                {/* 一行レイアウト: 内容(バリュー) / データ型 / 項目(横長) */}
                                                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                                                    {/* 内容(バリュー)（横長） */}
                                                    <div style={{ flex: 2 }}>
                                                        <Tooltip text={'内容(バリュー): 実際にデータベースに保存される具体的な値を入力します。文字列以外はフォーマットに注意してください。'}>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: '600', cursor: 'help' }}>
                                                                内容(バリュー)
                                                            </label>
                                                        </Tooltip>
                                                        <input
                                                            type="text"
                                                            value={field.label || ''}
                                                            onChange={(e) => handleUpdateField(index, { label: e.target.value })}
                                                            placeholder={
                                                                field.fieldType === 'boolean' ? 'true または false' :
                                                                    field.fieldType === 'number' ? '例: 100, 3.14' :
                                                                        field.fieldType === 'timestamp' ? '例: 2025-01-15T09:00:00Z' :
                                                                            field.fieldType === 'geopoint' ? '例: {"latitude":35.6762,"longitude":139.6503}' :
                                                                                field.fieldType === 'reference' ? '例: collection/documentId' :
                                                                                    field.fieldType === 'map' ? 'グループは子項目で設定してください' :
                                                                                        field.fieldType === 'array' ? 'リストは子要素で設定してください' :
                                                                                            field.fieldType === 'null' ? '(未定義)' :
                                                                                                '例: ポケモン, ラベル, Box'
                                                            }
                                                            disabled={field.fieldType === 'null' || field.fieldType === 'map' || field.fieldType === 'array'}
                                                            style={{
                                                                width: '100%',
                                                                padding: '8px',
                                                                border: '1px solid #ced4da',
                                                                borderRadius: '4px',
                                                                fontSize: '13px',
                                                                backgroundColor: (field.fieldType === 'null' || field.fieldType === 'map' || field.fieldType === 'array') ? '#e9ecef' : 'white',
                                                            }}
                                                        />
                                                    </div>

                                                    {/* データ型（タイプ） - 各フィールドで選択可能 */}
                                                    <div style={{ flex: 1 }}>
                                                        <Tooltip text={'データ型（タイプ）: この項目にどのような形式の値を保存するかを選択します（文字列、数値、真偽値、日時、位置情報、参照、グループ、リストなど）。'}>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: '600', cursor: 'help' }}>
                                                                データ型（タイプ）
                                                            </label>
                                                        </Tooltip>
                                                        <select
                                                            value={field.fieldType || 'string'}
                                                            onChange={(e) => {
                                                                const newType = e.target.value as FieldType;
                                                                handleUpdateField(index, { fieldType: newType });
                                                                // map/array型に変更した場合、childrenを初期化
                                                                if ((newType === 'map' || newType === 'array') && !field.children) {
                                                                    handleUpdateField(index, { children: [] });
                                                                }
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                padding: '8px',
                                                                border: '1px solid #ced4da',
                                                                borderRadius: '4px',
                                                                fontSize: '13px',
                                                            }}
                                                        >
                                                            <option value="string">文字列 (string)</option>
                                                            <option value="number">数値 (number)</option>
                                                            <option value="boolean">真偽値 (boolean)</option>
                                                            <option value="map">グループ (map)</option>
                                                            <option value="array">リスト (array)</option>
                                                            <option value="null">未定義 (null)</option>
                                                            <option value="timestamp">タイムスタンプ (timestamp)</option>
                                                            <option value="geopoint">位置情報 (geopoint)</option>
                                                            <option value="reference">参照 (reference)</option>
                                                        </select>
                                                    </div>

                                                    {/* 項目（フィールド） */}
                                                    <div style={{ flex: 1 }}>
                                                        <Tooltip text={'項目（フィールド）: システム内部で使用する識別名です。半角英数字とアンダースコア推奨（例: pokemon, box_type）。'}>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: '600', cursor: 'help' }}>
                                                                項目（フィールド） *
                                                            </label>
                                                        </Tooltip>
                                                        <input
                                                            type="text"
                                                            value={field.value || ''}
                                                            onChange={(e) => handleUpdateField(index, { value: e.target.value })}
                                                            placeholder="pokemon"
                                                            style={{
                                                                width: '100%',
                                                                padding: '8px',
                                                                border: '1px solid #ced4da',
                                                                borderRadius: '4px',
                                                                fontSize: '13px',
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* map/array型の場合、子フィールドを表示 */}
                                                {(field.fieldType === 'map' || field.fieldType === 'array') && (
                                                    <div style={{ marginLeft: '20px', marginTop: '12px', marginBottom: '12px', padding: '12px', backgroundColor: '#ffffff', border: '2px dashed #ced4da', borderRadius: '6px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#495057' }}>
                                                                {field.fieldType === 'map' ? 'グループの項目' : 'リストの要素'}
                                                            </label>
                                                            <button
                                                                onClick={() => handleAddChildField(index, field.fieldType!)}
                                                                style={{
                                                                    padding: '4px 10px',
                                                                    backgroundColor: '#17a2b8',
                                                                    color: 'white',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '12px',
                                                                }}
                                                            >
                                                                ➕ {field.fieldType === 'map' ? '項目を追加' : '要素を追加'}
                                                            </button>
                                                        </div>

                                                        {(!field.children || field.children.length === 0) ? (
                                                            <p style={{ fontSize: '0.8rem', color: '#999', fontStyle: 'italic', textAlign: 'center', padding: '12px', margin: 0 }}>
                                                                {field.fieldType === 'map' ? '項目がありません' : '要素がありません'}
                                                            </p>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {field.children.map((childField, childIndex) => (
                                                                    <div
                                                                        key={childIndex}
                                                                        style={{
                                                                            padding: '12px',
                                                                            backgroundColor: '#f1f3f5',
                                                                            border: '1px solid #dee2e6',
                                                                            borderRadius: '4px',
                                                                        }}
                                                                    >
                                                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                                            <div style={{ flex: 1 }}>
                                                                                <Tooltip text={'内容(バリュー): ここにその子フィールドの具体的な値を入力します。選択したデータ型に合わせてフォーマットしてください。'}>
                                                                                    <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', fontWeight: '600', cursor: 'help' }}>
                                                                                        内容(バリュー)
                                                                                    </label>
                                                                                </Tooltip>
                                                                                <input
                                                                                    type="text"
                                                                                    value={childField.label || ''}
                                                                                    onChange={(e) => handleUpdateChildField(index, childIndex, { label: e.target.value })}
                                                                                    placeholder={
                                                                                        childField.fieldType === 'boolean' ? 'true または false' :
                                                                                            childField.fieldType === 'number' ? '例: 100, 3.14' :
                                                                                                childField.fieldType === 'timestamp' ? '例: 2025-01-15T09:00:00Z' :
                                                                                                    childField.fieldType === 'geopoint' ? '例: {"latitude":35.6762,"longitude":139.6503}' :
                                                                                                        childField.fieldType === 'reference' ? '例: collection/documentId' :
                                                                                                            childField.fieldType === 'null' ? '(未定義)' : '例: 値を入力'
                                                                                    }
                                                                                    disabled={childField.fieldType === 'null'}
                                                                                    style={{
                                                                                        width: '100%',
                                                                                        padding: '6px',
                                                                                        border: '1px solid #ced4da',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '12px',
                                                                                        backgroundColor: childField.fieldType === 'null' ? '#e9ecef' : 'white',
                                                                                    }}
                                                                                />
                                                                            </div>

                                                                            <div style={{ flex: 1 }}>
                                                                                <Tooltip text={'データ型（タイプ）: 子要素の型を選択します（文字列、数値、真偽値、日時、位置情報、参照、未定義）。グループ/リストは選択できません。'}>
                                                                                    <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', fontWeight: '600', cursor: 'help' }}>
                                                                                        データ型（タイプ）
                                                                                    </label>
                                                                                </Tooltip>
                                                                                <select
                                                                                    value={childField.fieldType || 'string'}
                                                                                    onChange={(e) => handleUpdateChildField(index, childIndex, { fieldType: e.target.value as FieldType })}
                                                                                    style={{
                                                                                        width: '100%',
                                                                                        padding: '6px',
                                                                                        border: '1px solid #ced4da',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '12px',
                                                                                    }}
                                                                                >
                                                                                    <option value="string">文字列 (string)</option>
                                                                                    <option value="number">数値 (number)</option>
                                                                                    <option value="boolean">真偽値 (boolean)</option>
                                                                                    <option value="null">未定義 (null)</option>
                                                                                    <option value="timestamp">タイムスタンプ (timestamp)</option>
                                                                                    <option value="geopoint">位置情報 (geopoint)</option>
                                                                                    <option value="reference">参照 (reference)</option>
                                                                                </select>
                                                                            </div>

                                                                            {field.fieldType === 'map' && (
                                                                                <div style={{ flex: 1 }}>
                                                                                    <Tooltip text={'項目（フィールド）: グループ内で使うキー名です（例: color, size）。'}>
                                                                                        <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', fontWeight: '600', cursor: 'help' }}>
                                                                                            項目（フィールド） *
                                                                                        </label>
                                                                                    </Tooltip>
                                                                                    <input
                                                                                        type="text"
                                                                                        value={childField.value || ''}
                                                                                        onChange={(e) => handleUpdateChildField(index, childIndex, { value: e.target.value })}
                                                                                        placeholder="key"
                                                                                        style={{
                                                                                            width: '100%',
                                                                                            padding: '6px',
                                                                                            border: '1px solid #ced4da',
                                                                                            borderRadius: '4px',
                                                                                            fontSize: '12px',
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                            )}

                                                                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                                                                <button
                                                                                    onClick={() => handleDeleteChildField(index, childIndex)}
                                                                                    style={{
                                                                                        padding: '6px 10px',
                                                                                        backgroundColor: '#dc3545',
                                                                                        color: 'white',
                                                                                        border: 'none',
                                                                                        borderRadius: '4px',
                                                                                        cursor: 'pointer',
                                                                                        fontSize: '11px',
                                                                                    }}
                                                                                >
                                                                                    ⊖
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    {/* Enabled */}
                                                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={field.enabled}
                                                            onChange={(e) => handleUpdateField(index, { enabled: e.target.checked })}
                                                            style={{ marginRight: '6px' }}
                                                        />
                                                        有効
                                                    </label>

                                                    {/* アクションボタン */}
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button
                                                            onClick={() => handleMoveField(index, 'up')}
                                                            disabled={index === 0}
                                                            style={{
                                                                padding: '4px 8px',
                                                                backgroundColor: index === 0 ? '#e9ecef' : '#6c757d',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                cursor: index === 0 ? 'not-allowed' : 'pointer',
                                                                fontSize: '12px',
                                                            }}
                                                        >
                                                            ↑
                                                        </button>
                                                        <button
                                                            onClick={() => handleMoveField(index, 'down')}
                                                            disabled={index === editingDoc.fields.length - 1}
                                                            style={{
                                                                padding: '4px 8px',
                                                                backgroundColor: index === editingDoc.fields.length - 1 ? '#e9ecef' : '#6c757d',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                cursor: index === editingDoc.fields.length - 1 ? 'not-allowed' : 'pointer',
                                                                fontSize: '12px',
                                                            }}
                                                        >
                                                            ↓
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteField(index)}
                                                            style={{
                                                                padding: '4px 8px',
                                                                backgroundColor: '#dc3545',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                fontSize: '12px',
                                                            }}
                                                        >
                                                            削除
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                                }
                            </div>

                            {/* アクションボタン */}
                            <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
                                <button
                                    onClick={handleSave}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        backgroundColor: '#28a745',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '16px',
                                        fontWeight: '600',
                                    }}
                                >
                                    {saveStatus === 'saved' ? '保存完了しました' : '💾 保存'}
                                </button>

                                {selectedDocId !== '__new__' && (
                                    <button
                                        onClick={handleDelete}
                                        style={{
                                            padding: '12px 24px',
                                            backgroundColor: '#dc3545',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '16px',
                                            fontWeight: '600',
                                        }}
                                    >
                                        🗑️ 削除
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 使い方 */}
            <div
                style={{
                    marginTop: '24px',
                    padding: '24px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                }}
            >
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', fontWeight: '600' }}>
                    📝 使い方
                </h3>
                <ol style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li>「新規作成」または「テンプレートから作成」でドキュメントを作成</li>
                    <li>ドキュメントID、名前、説明を入力</li>
                    <li>（オプション）「サブコレクション追加」ボタンでサブコレクションを追加（例: types, states）</li>
                    <li>「フィールド追加」ボタンでフィールドを追加し、内容(バリュー)・データ型・項目を設定</li>
                    <li>フィールドの順序は ↑↓ ボタンで変更可能</li>
                    <li>「保存」ボタンでFirestoreに保存</li>
                </ol>

                <h3 style={{ fontSize: '1rem', marginTop: '20px', marginBottom: '12px', fontWeight: '600' }}>
                    💡 用語説明
                </h3>
                <ul style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li><strong>コレクション</strong>: Firestoreのトップレベルコレクション（例: taxonomies, users, products）</li>
                    <li><strong>ドキュメントID</strong>: コレクション内でのドキュメント識別子（例: categories, productTypes）</li>
                    <li><strong>サブコレクション</strong>: ドキュメント配下に作成されるコレクション（例: {collectionName}/state/types）</li>
                    <li><strong>項目(Value)</strong>: システム内部で使用する値（英数字推奨、例: pokemon, box）</li>
                    <li><strong>内容(バリュー)</strong>: ユーザーに表示される名前（日本語可、例: ポケモン、Box）</li>
                    <li><strong>Order</strong>: 表示順序（自動で設定されます）</li>
                    <li><strong>Enabled</strong>: 有効/無効の切り替え</li>
                </ul>

                <h3 style={{ fontSize: '1rem', marginTop: '20px', marginBottom: '12px', fontWeight: '600' }}>
                    🌲 サブコレクションの使い方
                </h3>
                <ul style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li>サブコレクションを追加すると、<code style={{ backgroundColor: '#e9ecef', padding: '2px 6px', borderRadius: '3px' }}>{collectionName}/親ドキュメントID/サブコレクション名/フィールドvalue</code> というパス構造が作成されます</li>
                    <li>例: <code style={{ backgroundColor: '#e9ecef', padding: '2px 6px', borderRadius: '3px' }}>{collectionName}/state/condition/pokemon</code> のように各フィールドが個別ドキュメントとして保存されます</li>
                    <li>サブコレクション選択後、フィールドを追加して保存すると、各フィールドがそのサブコレクション直下に個別ドキュメントとして格納されます</li>
                    <li>ルートドキュメントとサブコレクションでそれぞれ独立したフィールドセットを持つことができます</li>
                    <li><strong>コレクション切り替え</strong>: 上部のドロップダウンから別のコレクションに切り替えられます。カスタムコレクション名も指定可能です</li>
                </ul>
            </div>
        </div>
    );
}
