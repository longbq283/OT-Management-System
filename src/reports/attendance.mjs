const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const hours = minutes => minutes / 60;
const printFormat = '0.##';

const font = (size, bold = false) => `<font>${bold ? '<b/>' : ''}<sz val="${size}"/><name val="Times New Roman"/></font>`;
const fill = rgb => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
const edge = name => `<${name} style="thin"><color rgb="FF687683"/></${name}>`;
const xf = (fontId, fillId, borderId, align, numFmtId = 0) =>
  `<xf fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" numFmtId="${numFmtId}" xfId="0"
    applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1">
    <alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`;

function addPrintLayout(XLSX, workbook, totalRow, signatureRow) {
  const { CFB } = XLSX;
  const zip = CFB.read(new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), { type: 'array' });
  const encoder = new TextEncoder();
  function replace(path, update) {
    const part = CFB.find(zip, path);
    part.content = encoder.encode(update(new TextDecoder().decode(part.content)));
    part.size = part.content.length;
  }

  // SheetJS writes the data and formulas. Add print settings and the cell styles needed by the form.
  replace('/xl/styles.xml', () => `<?xml version="1.0" encoding="UTF-8"?>
    <styleSheet xmlns="${namespace}">
      <numFmts count="1"><numFmt numFmtId="164" formatCode="${printFormat}"/></numFmts>
      <fonts count="3">${font(11)}${font(11, true)}${font(14, true)}</fonts>
      <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
        ${fill('A8CAE7')}${fill('E7EEF6')}${fill('FFF1D5')}</fills>
      <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
        <border>${['left', 'right', 'top', 'bottom'].map(edge).join('')}<diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="10">
        ${xf(0, 0, 0, 'left')}${xf(2, 0, 0, 'left')}${xf(2, 0, 0, 'center')}
        ${xf(1, 2, 1, 'center')}${xf(0, 0, 1, 'left')}${xf(0, 0, 1, 'center', 49)}
        ${xf(0, 0, 1, 'center', 164)}${xf(1, 3, 1, 'center', 164)}
        ${xf(1, 4, 1, 'center', 164)}${xf(1, 0, 0, 'center')}
      </cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`);

  replace('/xl/worksheets/sheet1.xml', xml => xml
    .replace('<dimension ', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ')
    .replace(/<c r="([A-Z]+)(\d+)"(?: s="\d+")?/g, (match, column, rowText) => {
      const row = Number(rowText);
      const style = row === 1 ? 1 : row === 3 ? 2 : row === signatureRow ? 9 : row === 6 || row === 7 ? 3
        : row === totalRow ? 8 : row >= 8 && row < totalRow
          ? column === 'A' || column === 'C' ? 4 : column === 'B' ? 5 : ['AI', 'AJ', 'AK'].includes(column) ? 7 : 6
          : 0;
      return `<c r="${column}${row}" s="${style}"`;
    })
    .replace(/<pageMargins\b[^>]*\/>/, '')
    .replace(/(<ignoredErrors>|<\/worksheet>)/, '<pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/>' +
      '<pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/>$1'));
  return CFB.write(zip, { type: 'array', fileType: 'zip', compression: true });
}

export function createAttendanceFile({ project, year, month, calendar, entries }, XLSX) {
  if (!project || !Number.isInteger(year) || year < 2000 || year > 2100 ||
    !Number.isInteger(month) || month < 1 || month > 12) throw Error('Chọn đúng dự án, năm và tháng để xuất bảng trình ký.');
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!calendar || calendar.length !== count) throw Error('Kỳ này chưa có lịch đầy đủ để xuất bảng trình ký.');
  const records = entries.filter(row => row.projectId === project.id && row.year === year &&
    row.month === month && row.status === 'active');
  if (!records.length) throw Error('Kỳ này chưa có giờ OT đã lưu.');
  if (records.some(row => row.source !== 'daily')) throw Error('Kỳ có dữ liệu tổng hợp thiếu chi tiết theo ngày. Bổ sung chi tiết trước khi xuất trình ký.');
  if (records.some(row => !row.unit?.trim())) throw Error('Có cán bộ chưa lưu Đơn vị (Ban/TT) trong kỳ này. Bổ sung đơn vị trước khi xuất trình ký.');
  records.sort((a, b) => a.unit.localeCompare(b.unit, 'vi') || a.name.localeCompare(b.name, 'vi') ||
    a.employeeId.localeCompare(b.employeeId));
  const snapshotTypes = new Map();
  for (const row of records) for (const day of row.days) {
    const index = Number(day.date.slice(-2)) - 1;
    if (snapshotTypes.has(index) && snapshotTypes.get(index) !== day.type) {
      throw Error('Ngày ' + (index + 1) + ' có nhiều loại ngày trong dữ liệu đã lưu. Rà soát lại trước khi trình ký.');
    }
    snapshotTypes.set(index, day.type);
  }
  const dayColumns = Array.from({ length: 31 }, (_, i) => i < count ? i + 1 : '');
  const text = value => ({ t: 's', v: String(value ?? '') });
  const formula = (f, minutes) => ({ t: 'n', v: hours(minutes), f });
  const data = [
    ['DỰ ÁN ' + [project.code, project.name].filter(Boolean).join(' · ')],
    [],
    ['CHẤM LÀM THÊM GIỜ THÁNG ' + month + '/' + year],
    [], [],
    ['Họ tên', 'Mã cán bộ', 'Đơn vị (Ban/TT)', ...dayColumns, 'Giờ NT', 'Giờ NN', 'Tổng số giờ Tháng ' + month],
    ['Loại ngày (NT/NN/L)', '', '', ...dayColumns.map((day, i) => day ? snapshotTypes.get(i) ?? calendar[i] : ''), '', '', '']
  ];
  const totals = { ntMinutes: 0, nnMinutes: 0, totalMinutes: 0 };
  for (const record of records) {
    const row = data.length + 1;
    const minutesByDay = new Map(record.days.map(day => [Number(day.date.slice(-2)), day.minutes]));
    const range = 'D' + row + ':AH' + row;
    const criteria = '$D$7:$AH$7';
    const sumIf = type => `SUMIF(${criteria},"${type}",${range})`;
    data.push([text(record.name), text(record.employeeId), text(record.unit),
      ...dayColumns.map(day => minutesByDay.has(day) ? hours(minutesByDay.get(day)) : ''),
      formula(sumIf('NT'), record.ntMinutes), formula(sumIf('NN') + '+' + sumIf('L'), record.nnMinutes),
      formula('SUM(' + range + ')', record.totalMinutes)]);
    for (const key of Object.keys(totals)) totals[key] += record[key];
  }

  const totalRow = data.length + 1;
  data.push(['TỔNG', ...Array(33).fill(''), ...Object.values(totals).map((minutes, index) => {
    const column = ['AI', 'AJ', 'AK'][index];
    return formula(`SUM(${column}8:${column}${totalRow - 1})`, minutes);
  })]);
  const signatureRow = data.length + 4;
  const left = Array(37).fill('');
  left[2] = 'Lập bảng';
  left[19] = 'Phó Giám đốc Ban';
  data.push([], [], [], left, [], [], [], [], ['Ngày ...... tháng ...... năm ............']);
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet['!cols'] = [{ wch: 30 }, { wch: 13 }, { wch: 24 }, ...Array.from({ length: 31 }, () => ({ wch: 3.8 })),
    { wch: 8 }, { wch: 8 }, { wch: 14 }];
  worksheet['!rows'] = [{ hpt: 20 }, {}, { hpt: 24 }, {}, {}, { hpt: 26 }, { hpt: 20 }];
  worksheet['!merges'] = [
    XLSX.utils.decode_range('A1:AK1'), XLSX.utils.decode_range('A3:AK3'), XLSX.utils.decode_range('A' + totalRow + ':AH' + totalRow),
    XLSX.utils.decode_range('C' + signatureRow + ':J' + signatureRow), XLSX.utils.decode_range('T' + signatureRow + ':AK' + signatureRow)
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Chấm công OT');
  workbook.Workbook = { Names: [
    { Name: '_xlnm.Print_Area', Sheet: 0, Ref: "'Chấm công OT'!$A$1:$AK$" + data.length },
    { Name: '_xlnm.Print_Titles', Sheet: 0, Ref: "'Chấm công OT'!$6:$7" }
  ] };
  return addPrintLayout(XLSX, workbook, totalRow, signatureRow);
}
