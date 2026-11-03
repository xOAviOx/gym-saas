'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WorkBook } from 'xlsx';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { InlineError } from '@/components/shared/inline-error';
import { SubmitButton } from '@/components/shared/submit-button';
import { WorkflowSteps } from '@/components/shared/workflow-steps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  importDate,
  suggestColumnMapping,
  validColumnMapping,
  type ColumnMapping,
  type ImportInput,
  type ImportPreviewRow,
} from '@/features/members/import';
import { confirmMemberImport, previewMemberImport } from '@/features/members/import-actions';
import { copy } from '@/lib/copy';
import { formatPhone } from '@/lib/phone';

import { nativeSelectClass } from './member-fields';

type SheetData = {
  headers: string[];
  rows: { rowNumber: number; cells: string[] }[];
  date1904: boolean;
};

async function readSheet(workbook: WorkBook, name: string): Promise<SheetData> {
  const XLSX = await import('xlsx');
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(copy.memberImport.cannotRead);
  const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1');
  if (range.e.c > 39) throw new Error(copy.memberImport.tooManyColumns);
  if (range.e.r > MAX_IMPORT_ROWS) throw new Error(copy.memberImport.tooManyRows);
  const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: true,
    range: { s: { r: 0, c: 0 }, e: range.e },
  });
  const stringify = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
  const headers = (values[0] ?? []).map(stringify);
  const rows = values
    .slice(1)
    .map((cells, i) => ({ rowNumber: i + 2, cells: cells.map(stringify) }))
    .filter((row) => row.cells.some((cell) => cell !== ''));
  if (!headers.length || !rows.length) throw new Error(copy.memberImport.emptyFile);
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(copy.memberImport.tooManyRows);
  return { headers, rows, date1904: !!workbook.Workbook?.WBProps?.date1904 };
}

export function MemberImport() {
  const id = useId();
  const workbook = useRef<WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [input, setInput] = useState<ImportInput | null>(null);
  const [preview, setPreview] = useState<{
    rows: ImportPreviewRow[];
    ready: number;
    skipped: number;
  } | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);

  function reset() {
    workbook.current = null;
    setSheetNames([]);
    setSheetName('');
    setSheet(null);
    setMapping({});
    setInput(null);
    setPreview(null);
    setResult(null);
    setError('');
    setShowSkipped(false);
  }

  async function selectSheet(name: string, book = workbook.current) {
    if (!book) return;
    setError('');
    setPreview(null);
    setInput(null);
    setResult(null);
    setSheet(null);
    setSheetName(name);
    try {
      const next = await readSheet(book, name);
      setSheet(next);
      setMapping(suggestColumnMapping(next.headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.memberImport.cannotRead);
    }
  }
  async function upload(file: File) {
    setError('');
    setSheet(null);
    setPreview(null);
    setInput(null);
    setResult(null);
    workbook.current = null;
    setSheetNames([]);
    setSheetName('');
    setMapping({});
    if (!/\.(xlsx|xls|csv)$/i.test(file.name) || !file.size || file.size > MAX_IMPORT_BYTES) {
      setError(copy.memberImport.invalidFile);
      return;
    }
    setPending(true);
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        sheetRows: MAX_IMPORT_ROWS + 2,
        cellFormula: false,
        cellDates: false,
        raw: true,
      });
      if (!book.SheetNames.length) throw new Error(copy.memberImport.emptyFile);
      workbook.current = book;
      setSheetNames(book.SheetNames);
      await selectSheet(book.SheetNames[0]!, book);
    } catch {
      setError(copy.memberImport.cannotRead);
    }
    setPending(false);
  }
  async function review() {
    if (!sheet) return;
    setError('');
    if (mapping.fullName === undefined || mapping.phone === undefined) {
      setError(copy.memberImport.missingMapping);
      return;
    }
    if (!validColumnMapping(mapping)) {
      setError(copy.memberImport.duplicateMapping);
      return;
    }
    const rows: ImportInput['rows'] = sheet.rows.map((row) => {
      const values: ImportInput['rows'][number]['values'] = { fullName: '', phone: '' };
      for (const field of IMPORT_FIELDS) {
        const col = mapping[field.key];
        if (col !== undefined) {
          const cell = row.cells[col] ?? '';
          values[field.key] = ['dob', 'joinedOn', 'startDate'].includes(field.key)
            ? importDate(cell, sheet.date1904)
            : cell;
        }
      }
      return { rowNumber: row.rowNumber, requestId: crypto.randomUUID(), values };
    });
    const next = { rows };
    setPending(true);
    try {
      const response = await previewMemberImport(next);
      if (applyActionResult(response)) {
        setInput(next);
        setPreview(response.data);
        setShowSkipped(false);
      } else setError(response.error);
    } catch {
      setError(copy.errors.network);
    }
    setPending(false);
  }
  async function confirm() {
    if (!input) return;
    setPending(true);
    setError('');
    try {
      const response = await confirmMemberImport(input);
      if (applyActionResult(response)) {
        setResult(response.data);
        toast.success(copy.memberImport.finished);
      } else setError(response.error);
    } catch {
      setError(copy.errors.network);
    }
    setPending(false);
  }
  async function template() {
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([IMPORT_FIELDS.map((field) => field.label)]),
        copy.members.title,
      );
      const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = copy.memberImport.templateName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(copy.errors.generic);
    }
  }
  const progress = (
    <WorkflowSteps
      label={copy.memberImport.progress}
      steps={copy.memberImport.steps}
      current={preview || result ? 2 : sheet ? 1 : 0}
      complete={!!result}
    />
  );
  const visibleRows = preview?.rows.filter((row) => !showSkipped || row.status !== 'ready') ?? [];
  if (result)
    return (
      <div className="grid gap-6">
        {progress}
        <section className="bg-card grid gap-5 rounded-xl border p-6">
          <h2 className="text-xl">{copy.memberImport.finished}</h2>
          <p className="text-muted-foreground text-sm" role="status">
            {copy.memberImport.result(result.imported, result.skipped)}
          </p>
          <Button asChild className="w-full sm:w-auto sm:justify-self-start">
            <Link href="/members">{copy.memberImport.viewMembers}</Link>
          </Button>
          <Button
            variant="outline"
            onClick={reset}
            className="w-full sm:w-auto sm:justify-self-start"
          >
            {copy.memberImport.startAgain}
          </Button>
        </section>
      </div>
    );
  return (
    <div className="grid gap-6">
      {progress}
      {error ? (
        <InlineError
          title={error}
          action={
            <Button
              variant="outline"
              onClick={preview ? confirm : sheet ? review : () => setError('')}
            >
              {copy.common.retry}
            </Button>
          }
        />
      ) : null}
      {!preview ? (
        <>
          <section className="bg-card grid gap-4 rounded-xl border p-5">
            <Label htmlFor={`${id}-file`}>{copy.memberImport.upload}</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={pending}
              className="h-auto min-h-11 py-3"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void upload(file);
              }}
            />
            <p className="text-muted-foreground text-sm">{copy.memberImport.uploadHelp}</p>
            <Button type="button" variant="outline" className="w-fit" onClick={template}>
              {copy.memberImport.downloadTemplate}
            </Button>
          </section>
          {sheetNames.length > 1 ? (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-sheet`}>{copy.memberImport.worksheet}</Label>
              <select
                id={`${id}-sheet`}
                disabled={pending}
                className={nativeSelectClass}
                value={sheetName}
                onChange={(e) => void selectSheet(e.target.value)}
              >
                {sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {sheet ? (
            <section className="grid gap-5">
              <div>
                <h2 className="text-xl">{copy.memberImport.mapTitle}</h2>
                <p className="mt-2 text-sm">{copy.memberImport.rowsDetected(sheet.rows.length)}</p>
                <p className="text-muted-foreground mt-2 text-sm">{copy.memberImport.planHelp}</p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {copy.memberImport.consentHelp} {copy.memberImport.dateHelp}
                </p>
              </div>
              <fieldset disabled={pending} className="bg-card grid gap-4 rounded-xl border p-5">
                {IMPORT_FIELDS.map((field) => (
                  <div key={field.key} className="grid gap-2 sm:grid-cols-2 sm:items-center">
                    <Label htmlFor={`${id}-${field.key}`} className="leading-relaxed">
                      {field.label}
                      {'required' in field && field.required ? ` (${copy.common.required})` : ''}
                    </Label>
                    <select
                      id={`${id}-${field.key}`}
                      className={nativeSelectClass}
                      value={mapping[field.key] ?? ''}
                      onChange={(e) => {
                        const col = e.target.value === '' ? undefined : Number(e.target.value);
                        setMapping((old) => ({ ...old, [field.key]: col }));
                      }}
                    >
                      <option value="">{copy.memberImport.skipColumn}</option>
                      {sheet.headers.map((header, i) => (
                        <option key={i} value={i}>
                          {header || copy.memberImport.fileRow(i + 1)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </fieldset>
              <div className="bg-background/95 sticky bottom-16 -mx-4 px-4 py-3 backdrop-blur md:bottom-0">
                <SubmitButton
                  type="button"
                  className="w-full sm:w-auto"
                  pending={pending}
                  pendingLabel={copy.common.loading}
                  onClick={review}
                >
                  {copy.memberImport.preview}
                </SubmitButton>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section className="grid gap-3">
            <h2 className="text-xl">{copy.memberImport.previewTitle}</h2>
            <p className="text-muted-foreground text-sm">{copy.memberImport.previewHelp}</p>
            <p className="font-medium" role="status">
              {copy.memberImport.summary(preview.ready, preview.skipped)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={showSkipped ? 'outline' : 'secondary'}
                aria-pressed={!showSkipped}
                disabled={pending}
                onClick={() => setShowSkipped(false)}
              >
                {copy.memberImport.allRows}
              </Button>
              <Button
                type="button"
                variant={showSkipped ? 'secondary' : 'outline'}
                aria-pressed={showSkipped}
                disabled={pending || !preview.skipped}
                onClick={() => setShowSkipped(true)}
              >
                {copy.memberImport.skippedRows}
              </Button>
            </div>
          </section>
          <ol className="grid gap-3">
            {visibleRows.slice(0, 100).map((row) => (
              <li key={row.rowNumber} className="bg-card grid gap-2 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">
                      {row.fullName || copy.members.unknownMember}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {copy.memberImport.row} {row.rowNumber} · {formatPhone(row.phone)}
                      {row.planName ? ` · ${row.planName}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase ${row.status === 'ready' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}
                  >
                    {row.status === 'ready'
                      ? copy.memberImport.ready
                      : row.status === 'invalid'
                        ? copy.memberImport.invalid
                        : copy.memberImport.duplicate}
                  </span>
                </div>
                {row.status === 'duplicateFile' || row.status === 'duplicateExisting' ? (
                  <p className="text-muted-foreground text-xs">{copy.memberImport[row.status]}</p>
                ) : null}
                {row.issues.length ? (
                  <ul className="text-danger grid gap-1 text-xs">
                    {row.issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
          {visibleRows.length > 100 ? (
            <p className="text-muted-foreground text-sm">{copy.memberImport.previewTruncated}</p>
          ) : null}
          {!preview.ready ? (
            <p className="text-muted-foreground text-sm">{copy.memberImport.noReady}</p>
          ) : null}
          <div className="bg-background/95 sticky bottom-16 -mx-4 flex gap-3 px-4 py-3 backdrop-blur md:bottom-0">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setPreview(null);
                setInput(null);
                setError('');
              }}
            >
              {copy.common.back}
            </Button>
            <SubmitButton
              type="button"
              className="flex-1 sm:flex-none"
              disabled={!preview.ready}
              pending={pending}
              pendingLabel={copy.common.saving}
              onClick={confirm}
            >
              {copy.memberImport.confirm(preview.ready)}
            </SubmitButton>
          </div>
        </>
      )}
    </div>
  );
}
