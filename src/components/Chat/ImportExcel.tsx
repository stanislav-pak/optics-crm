import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';

interface ImportRow {
  name: string;
  phone: string;
  branch: string;
}

interface ResultRow extends ImportRow {
  status: 'success' | 'error' | 'duplicate';
  message: string;
}

interface Branch {
  id: string;
  name: string;
  city: string;
}

interface Props {
  onClose: () => void;
  branches: Branch[];
}

function normalizePhone(raw: string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('8') && digits.length === 11) return '+7' + digits.slice(1);
  if (digits.startsWith('7') && digits.length === 11) return '+' + digits;
  if (digits.length === 10) return '+7' + digits;
  return '+' + digits;
}

export function ImportExcel({ onClose, branches }: Props) {
  const { employee } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState('');

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Имя клиента', 'Номер телефона', 'Филиал'],
      ['Иван Иванов', '+77001112233', 'Алматы'],
      ['Анна Смирнова', '87772223344', 'Астана'],
    ]);
    ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Клиенты');
    XLSX.writeFile(wb, 'шаблон_импорт_клиентов.xlsx');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults([]);
    setDone(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];

      // Пропускаем заголовок
      const parsed: ImportRow[] = raw.slice(1)
        .filter(row => row[1]) // телефон обязателен
        .map(row => ({
          name: String(row[0] ?? '').trim(),
          phone: normalizePhone(row[1]),
          branch: String(row[2] ?? '').trim(),
        }));

      setRows(parsed);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const findBranch = (branchName: string): Branch | null => {
    if (!branchName) return branches[0] ?? null;
    return branches.find(b =>
      b.name.toLowerCase().includes(branchName.toLowerCase()) ||
      b.city.toLowerCase().includes(branchName.toLowerCase())
    ) ?? branches[0] ?? null;
  };

  const runImport = async () => {
    if (!employee || rows.length === 0) return;
    setImporting(true);
    const res: ResultRow[] = [];

    for (const row of rows) {
      const branch = findBranch(row.branch);
      if (!branch) {
        res.push({ ...row, status: 'error', message: 'Филиал не найден' });
        continue;
      }

      // Создаём или находим клиента
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('phone', row.phone)
        .maybeSingle();

      if (existing) {
        res.push({ ...row, status: 'duplicate', message: 'Уже существует' });
        continue;
      }

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .insert({
          branch_id: branch.id,
          phone: row.phone,
          name: row.name || null,
          status: 'new',
          contact_type: 'whatsapp',
          first_contact_date: new Date().toISOString(),
          last_contact_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (clientError || !client) {
        res.push({ ...row, status: 'error', message: clientError?.message ?? 'Ошибка создания' });
        continue;
      }

      // Создаём чат
      const { error: chatError } = await supabase.from('chats').insert({
        employee_id: employee.id,
        client_id: client.id,
        branch_id: branch.id,
        status: 'active',
      });

      if (chatError) {
        res.push({ ...row, status: 'error', message: 'Клиент создан, чат не создан' });
      } else {
        res.push({ ...row, status: 'success', message: `Добавлен в ${branch.name}` });
      }
    }

    setResults(res);
    setImporting(false);
    setDone(true);
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const dupCount = results.filter(r => r.status === 'duplicate').length;
  const errCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#111b21] rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 bg-[#202c33] rounded-t-xl flex items-center justify-between border-b border-white/5">
          <p className="text-sm font-semibold text-[#e9edef]">Импорт клиентов из Excel</p>
          <button onClick={onClose} className="text-[#8696a0] hover:text-[#e9edef]">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Шаблон */}
          <div className="bg-[#202c33] rounded-lg p-4">
            <p className="text-xs text-[#8696a0] mb-2">Шаг 1 — скачай шаблон</p>
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Скачать шаблон .xlsx
            </button>
            <p className="text-[10px] text-[#8696a0] mt-2">Колонки: Имя клиента · Номер телефона · Филиал</p>
          </div>

          {/* Загрузка */}
          <div className="bg-[#202c33] rounded-lg p-4">
            <p className="text-xs text-[#8696a0] mb-2">Шаг 2 — загрузи заполненный файл</p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border border-dashed border-white/20 rounded-lg py-4 text-sm text-[#8696a0] hover:border-emerald-500 hover:text-emerald-400 transition-colors">
              {fileName ? `📄 ${fileName}` : '+ Выбрать файл'}
            </button>
          </div>

          {/* Превью */}
          {rows.length > 0 && !done && (
            <div className="bg-[#202c33] rounded-lg p-4">
              <p className="text-xs text-[#8696a0] mb-2">Найдено записей: <span className="text-[#e9edef]">{rows.length}</span></p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {rows.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-[#d1d7db]">
                    <span className="text-[#8696a0]">{i + 1}.</span>
                    <span className="flex-1 truncate">{r.name || 'Без имени'}</span>
                    <span className="text-[#8696a0]">{r.phone}</span>
                  </div>
                ))}
                {rows.length > 5 && <p className="text-xs text-[#8696a0]">...и ещё {rows.length - 5}</p>}
              </div>
            </div>
          )}

          {/* Результаты */}
          {done && (
            <div className="bg-[#202c33] rounded-lg p-4 space-y-3">
              <div className="flex gap-4 text-xs">
                <span className="text-emerald-400">✓ Добавлено: {successCount}</span>
                <span className="text-yellow-400">≈ Дубликаты: {dupCount}</span>
                {errCount > 0 && <span className="text-red-400">✕ Ошибки: {errCount}</span>}
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs ${
                    r.status === 'success' ? 'text-emerald-400' :
                    r.status === 'duplicate' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    <span>{r.status === 'success' ? '✓' : r.status === 'duplicate' ? '≈' : '✕'}</span>
                    <span className="flex-1 truncate text-[#d1d7db]">{r.name || r.phone}</span>
                    <span>{r.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-[#8696a0] bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
            {done ? 'Закрыть' : 'Отмена'}
          </button>
          {!done && rows.length > 0 && (
            <button onClick={runImport} disabled={importing}
              className="flex-1 py-2 text-sm text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
              {importing ? 'Импорт...' : `Импортировать ${rows.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}