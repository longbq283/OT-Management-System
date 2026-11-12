export const MIN_UPLOAD_YEAR=2026;
export const MAX_UPLOAD_YEAR=2100;
export const uploadYears=()=>Array.from({length:MAX_UPLOAD_YEAR-MIN_UPLOAD_YEAR+1},(_,i)=>MIN_UPLOAD_YEAR+i);
export const validUploadYear=year=>Number.isInteger(Number(year))&&Number(year)>=MIN_UPLOAD_YEAR&&Number(year)<=MAX_UPLOAD_YEAR;
