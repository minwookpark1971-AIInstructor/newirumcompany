/**
 * Supabase Client
 * 신청(applications)·문의(inquiries) 제출 및 관리자 조회에 공용으로 사용.
 * 페이지에서 supabase-js v2 UMD를 먼저 로드해야 한다:
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */

const SUPABASE_URL = 'https://tdayexcmksjfryhthyfz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BLdv2L6WneDsbz3mqp8hgA_kXRcc78X';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/**
 * 교육 신청 제출
 * @param {{track:string, org_name?:string, contact_name:string, email:string,
 *          phone?:string, program_slug?:string, headcount?:number,
 *          preferred_date?:string, message?:string}} data
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function submitApplication(data) {
    const { error } = await supabaseClient.from('site_applications').insert(data);
    if (error) {
        console.error('신청 제출 실패:', error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

/**
 * 문의 제출
 * @param {{name:string, email:string, category?:string, message:string}} data
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function submitInquiry(data) {
    const { error } = await supabaseClient.from('site_inquiries').insert(data);
    if (error) {
        console.error('문의 제출 실패:', error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}
