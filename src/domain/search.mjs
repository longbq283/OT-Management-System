export const searchKey=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim().replace(/\s+/g,' ');
export const matchesSearch=(values,query='')=>searchKey(values.join(' ')).includes(searchKey(query));
