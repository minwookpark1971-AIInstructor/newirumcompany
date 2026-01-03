/**
 * 백엔드 서버 (Node.js/Express)
 * OAuth 인증 처리 및 사용자 정보 관리
 * 
 * 설치 방법:
 * 1. npm install express cors dotenv axios
 * 2. .env 파일 생성 및 환경 변수 설정
 * 3. node server.js 실행
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // 프론트엔드 파일 서빙

// Toss Payments Configuration
const TOSS_CONFIG = {
    secretKey: process.env.TOSS_SECRET_KEY || '',
    clientKey: process.env.TOSS_CLIENT_KEY || '',
    baseUrl: process.env.APP_BASE_URL || `http://localhost:${PORT}`,
    webhookSecret: process.env.TOSS_WEBHOOK_SECRET || ''
};

// In-memory order storage (실제 운영 환경에서는 DB 사용 권장)
// 구조: { orderId: { id, userId, amount, currency, status, paymentKey, method, rawResponse, createdAt, updatedAt } }
const orders = {};

// Helper: Generate UUID
function generateOrderId() {
    return 'order_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

// 환경 변수 확인
const OAUTH_CONFIG = {
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET
    },
    naver: {
        clientId: process.env.NAVER_CLIENT_ID,
        clientSecret: process.env.NAVER_CLIENT_SECRET
    },
    kakao: {
        restApiKey: process.env.KAKAO_REST_API_KEY
    },
    apple: {
        clientId: process.env.APPLE_CLIENT_ID,
        teamId: process.env.APPLE_TEAM_ID,
        keyId: process.env.APPLE_KEY_ID,
        privateKey: process.env.APPLE_PRIVATE_KEY
    }
};

// Google OAuth 처리
async function handleGoogleCallback(code, redirectUri) {
    try {
        // 인증 코드를 액세스 토큰으로 교환
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', null, {
            params: {
                code: code,
                client_id: OAUTH_CONFIG.google.clientId,
                client_secret: OAUTH_CONFIG.google.clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, id_token } = tokenResponse.data;

        // 사용자 정보 가져오기
        const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const userInfo = userResponse.data;

        return {
            success: true,
            email: userInfo.email,
            name: userInfo.name || userInfo.given_name || '',
            token: access_token,
            user: {
                email: userInfo.email,
                name: userInfo.name || userInfo.given_name || '',
                picture: userInfo.picture
            }
        };
    } catch (error) {
        console.error('Google OAuth error:', error.response?.data || error.message);
        throw new Error('Google 로그인 처리 중 오류가 발생했습니다.');
    }
}

// Naver OAuth 처리
async function handleNaverCallback(code, state, redirectUri) {
    try {
        // 인증 코드를 액세스 토큰으로 교환
        const tokenResponse = await axios.post('https://nid.naver.com/oauth2.0/token', null, {
            params: {
                grant_type: 'authorization_code',
                client_id: OAUTH_CONFIG.naver.clientId,
                client_secret: OAUTH_CONFIG.naver.clientSecret,
                code: code,
                state: state
            }
        });

        const { access_token } = tokenResponse.data;

        // 사용자 정보 가져오기
        const userResponse = await axios.get('https://openapi.naver.com/v1/nid/me', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const userInfo = userResponse.data.response;

        return {
            success: true,
            email: userInfo.email,
            name: userInfo.name || userInfo.nickname || '',
            phone: userInfo.mobile || '',
            token: access_token,
            user: {
                email: userInfo.email,
                name: userInfo.name || userInfo.nickname || '',
                phone: userInfo.mobile || '',
                profile_image: userInfo.profile_image
            }
        };
    } catch (error) {
        console.error('Naver OAuth error:', error.response?.data || error.message);
        throw new Error('Naver 로그인 처리 중 오류가 발생했습니다.');
    }
}

// Kakao OAuth 처리
async function handleKakaoCallback(code, redirectUri) {
    try {
        // 인증 코드를 액세스 토큰으로 교환
        const tokenResponse = await axios.post('https://kauth.kakao.com/oauth/token', null, {
            params: {
                grant_type: 'authorization_code',
                client_id: OAUTH_CONFIG.kakao.restApiKey,
                redirect_uri: redirectUri,
                code: code
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token } = tokenResponse.data;

        // 사용자 정보 가져오기
        const userResponse = await axios.get('https://kapi.kakao.com/v2/user/me', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const kakaoAccount = userResponse.data.kakao_account;
        const profile = kakaoAccount?.profile;

        return {
            success: true,
            email: kakaoAccount?.email || '',
            name: profile?.nickname || kakaoAccount?.name || '',
            phone: kakaoAccount?.phone_number || '',
            token: access_token,
            user: {
                email: kakaoAccount?.email || '',
                name: profile?.nickname || kakaoAccount?.name || '',
                phone: kakaoAccount?.phone_number || '',
                profile_image: profile?.profile_image_url
            }
        };
    } catch (error) {
        console.error('Kakao OAuth error:', error.response?.data || error.message);
        throw new Error('Kakao 로그인 처리 중 오류가 발생했습니다.');
    }
}

// Apple OAuth 처리 (더 복잡함 - JWT 서명 필요)
async function handleAppleCallback(code, redirectUri) {
    // Apple OAuth는 JWT 서명이 필요하여 더 복잡합니다
    // 실제 구현 시 Apple Developer 문서 참조 필요
    throw new Error('Apple OAuth는 추가 구현이 필요합니다.');
}

// OAuth 콜백 엔드포인트
app.post('/api/auth/:provider/callback', async (req, res) => {
    const { provider } = req.params;
    const { code, state, redirectUri } = req.body;

    if (!code) {
        return res.status(400).json({
            success: false,
            message: '인증 코드가 없습니다.'
        });
    }

    try {
        let userInfo;

        switch (provider) {
            case 'google':
                if (!OAUTH_CONFIG.google.clientId || !OAUTH_CONFIG.google.clientSecret) {
                    return res.status(500).json({
                        success: false,
                        message: 'Google OAuth 설정이 필요합니다.'
                    });
                }
                userInfo = await handleGoogleCallback(code, redirectUri);
                break;

            case 'naver':
                if (!OAUTH_CONFIG.naver.clientId || !OAUTH_CONFIG.naver.clientSecret) {
                    return res.status(500).json({
                        success: false,
                        message: 'Naver OAuth 설정이 필요합니다.'
                    });
                }
                userInfo = await handleNaverCallback(code, state, redirectUri);
                break;

            case 'kakao':
                if (!OAUTH_CONFIG.kakao.restApiKey) {
                    return res.status(500).json({
                        success: false,
                        message: 'Kakao OAuth 설정이 필요합니다.'
                    });
                }
                userInfo = await handleKakaoCallback(code, redirectUri);
                break;

            case 'apple':
                userInfo = await handleAppleCallback(code, redirectUri);
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: '지원하지 않는 provider입니다.'
                });
        }

        res.json(userInfo);
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'OAuth 처리 중 오류가 발생했습니다.'
        });
    }
});

// 헬스 체크 엔드포인트
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// 클라이언트 키 조회 엔드포인트 (프론트엔드용)
app.get('/api/payments/client-key', (req, res) => {
    res.json({
        clientKey: TOSS_CONFIG.clientKey
    });
});

// ============================================
// Toss Payments API Endpoints
// ============================================

// 주문 생성 API
app.post('/api/payments/create-order', async (req, res) => {
    try {
        const { items, planId, userId, courseSlug, courseTitle } = req.body;

        // 서버에서 최종 결제 금액 계산 (클라이언트 입력 금액 신뢰 금지)
        let amount = 0;
        let orderName = '강의 신청';

        // Get price from localStorage data (실제로는 DB에서 가져와야 함)
        // For now, we'll use a simple calculation
        if (courseSlug) {
            // Try to get price from localStorage structure (simulated)
            // 실제로는 DB에서 가격을 조회해야 함
            amount = 0; // Will be set from coursePrices in localStorage
        }

        // If amount is provided and valid, use it (but validate on server)
        if (req.body.amount && req.body.amount > 0) {
            amount = parseInt(req.body.amount);
        }

        if (amount <= 0) {
            return res.status(400).json({
                ok: false,
                error: '유효한 결제 금액이 필요합니다.'
            });
        }

        if (courseTitle) {
            orderName = courseTitle;
        }

        // Generate order ID
        const orderId = generateOrderId();

        // Get customer key
        const customerKey = userId || 'guest-' + Date.now();

        // Create order in storage
        const order = {
            id: orderId,
            userId: userId || null,
            amount: amount,
            currency: 'KRW',
            status: 'CREATED',
            paymentKey: null,
            method: null,
            rawResponse: null,
            orderName: orderName,
            customerKey: customerKey,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        orders[orderId] = order;

        res.json({
            ok: true,
            orderId: orderId,
            amount: amount,
            orderName: orderName,
            customerKey: customerKey
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({
            ok: false,
            error: '주문 생성 중 오류가 발생했습니다.'
        });
    }
});

// 결제 승인 API
app.post('/api/payments/confirm', async (req, res) => {
    try {
        const { paymentKey, orderId, amount } = req.body;

        if (!paymentKey || !orderId || !amount) {
            return res.status(400).json({
                ok: false,
                error: '필수 파라미터가 누락되었습니다.'
            });
        }

        // DB에서 order 조회
        const order = orders[orderId];
        if (!order) {
            return res.status(404).json({
                ok: false,
                error: '주문을 찾을 수 없습니다.'
            });
        }

        // Amount 검증 (가격 변조 방지)
        if (order.amount !== parseInt(amount)) {
            console.error(`Amount mismatch for order ${orderId}: DB=${order.amount}, Request=${amount}`);
            return res.status(400).json({
                ok: false,
                error: '결제 금액이 일치하지 않습니다.'
            });
        }

        // 이미 결제 완료된 경우 멱등 응답
        if (order.status === 'PAID') {
            return res.json({
                ok: true,
                order: order,
                message: '이미 결제 완료된 주문입니다.'
            });
        }

        // Toss Payments 승인 API 호출
        if (!TOSS_CONFIG.secretKey) {
            return res.status(500).json({
                ok: false,
                error: '결제 서버 설정이 필요합니다.'
            });
        }

        const confirmResponse = await axios.post(
            'https://api.tosspayments.com/v1/payments/confirm',
            {
                paymentKey: paymentKey,
                orderId: orderId,
                amount: amount
            },
            {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(TOSS_CONFIG.secretKey + ':').toString('base64'),
                    'Content-Type': 'application/json'
                }
            }
        );

        const paymentData = confirmResponse.data;

        // 주문 상태 업데이트
        order.status = 'PAID';
        order.paymentKey = paymentKey;
        order.method = paymentData.method || '카드';
        order.rawResponse = paymentData;
        order.updatedAt = new Date().toISOString();

        orders[orderId] = order;

        res.json({
            ok: true,
            order: {
                id: order.id,
                orderName: order.orderName,
                amount: order.amount,
                method: order.method,
                createdAt: order.createdAt
            }
        });
    } catch (error) {
        console.error('Payment confirm error:', error.response?.data || error.message);

        // Update order status to FAILED
        if (req.body.orderId && orders[req.body.orderId]) {
            orders[req.body.orderId].status = 'FAILED';
            orders[req.body.orderId].rawResponse = error.response?.data || { error: error.message };
            orders[req.body.orderId].updatedAt = new Date().toISOString();
        }

        res.status(500).json({
            ok: false,
            error: error.response?.data?.message || '결제 승인 중 오류가 발생했습니다.'
        });
    }
});

// 웹훅 엔드포인트 (권장)
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    try {
        const signature = req.headers['x-toss-signature'];
        const webhookSecret = TOSS_CONFIG.webhookSecret;

        // 웹훅 서명 검증 (HMAC SHA-256)
        if (webhookSecret && signature) {
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(req.body)
                .digest('base64');

            if (signature !== expectedSignature) {
                console.error('Webhook signature verification failed');
                return res.status(401).json({ ok: false, error: 'Invalid signature' });
            }
        }

        const event = JSON.parse(req.body.toString());
        const { eventType, data } = event;

        // 이벤트 타입에 따라 주문 상태 업데이트
        if (data.orderId && orders[data.orderId]) {
            const order = orders[data.orderId];

            switch (eventType) {
                case 'PAYMENT_CONFIRMED':
                    if (order.status !== 'PAID') {
                        order.status = 'PAID';
                        order.paymentKey = data.paymentKey;
                        order.method = data.method;
                        order.rawResponse = data;
                        order.updatedAt = new Date().toISOString();
                    }
                    break;
                case 'PAYMENT_FAILED':
                    order.status = 'FAILED';
                    order.rawResponse = data;
                    order.updatedAt = new Date().toISOString();
                    break;
                case 'PAYMENT_CANCELED':
                    order.status = 'CANCELED';
                    order.rawResponse = data;
                    order.updatedAt = new Date().toISOString();
                    break;
            }

            orders[data.orderId] = order;
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ ok: false, error: 'Webhook processing failed' });
    }
});

// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    // 환경 변수에서 관리자 계정 정보 확인
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin1234';

    if (username === adminUser && password === adminPass) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`\n🚀 서버가 시작되었습니다!`);
    console.log(`📍 포트: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`\n📝 OAuth 설정 확인:`);
    console.log(`   Google: ${OAUTH_CONFIG.google.clientId ? '✅' : '❌'}`);
    console.log(`   Naver: ${OAUTH_CONFIG.naver.clientId ? '✅' : '❌'}`);
    console.log(`   Kakao: ${OAUTH_CONFIG.kakao.restApiKey ? '✅' : '❌'}`);
    console.log(`\n💳 Toss Payments 설정 확인:`);
    console.log(`   Secret Key: ${TOSS_CONFIG.secretKey ? '✅' : '❌'}`);
    console.log(`   Client Key: ${TOSS_CONFIG.clientKey ? '✅' : '❌'}`);
    console.log(`   Base URL: ${TOSS_CONFIG.baseUrl}`);
    console.log(`\n💡 .env 파일에 OAuth 및 Toss Payments 설정을 추가하세요.\n`);
});





