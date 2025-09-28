import { Buffer } from 'node:buffer';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

const CANVAS_W = 1000;
const CANVAS_H = 260;
const SCALE = 2;

const fetchImpl =
  globalThis.fetch ?? ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const ROBLOX_IMAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; DedosShopBot/1.0; +https://discord.gg/dedos)',
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
};

const profileCache = new Map();

async function fetchImageAsBuffer(url) {
  const response = await fetchImpl(url, { headers: ROBLOX_IMAGE_HEADERS });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al descargar imagen`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function loadRobloxImage(source) {
  const imageBuffer = await fetchImageAsBuffer(source);
  return loadImage(imageBuffer);
}

async function getUserIdFromUsername(username) {
  const cacheKey = `username:${username.toLowerCase()}`;
  if (profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey);
  }
  const res = await fetchImpl('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });
  if (!res.ok) {
    throw new Error(`Roblox username lookup failed with status ${res.status}`);
  }
  const data = await res.json();
  const hit = data?.data?.[0];
  if (!hit?.id) {
    throw new Error('Usuario de Roblox no encontrado');
  }
  profileCache.set(cacheKey, hit.id);
  return hit.id;
}

async function getRobloxInfo(userId) {
  const cacheKey = `user:${userId}`;
  if (profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey);
  }
  const userRes = await fetchImpl(`https://users.roblox.com/v1/users/${userId}`);
  if (!userRes.ok) {
    throw new Error(`Roblox user fetch failed with status ${userRes.status}`);
  }
  const userData = await userRes.json();

  const avatarRes = await fetchImpl(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=352x352&format=Png&isCircular=false`
  );
  if (!avatarRes.ok) {
    throw new Error(`Roblox avatar fetch failed with status ${avatarRes.status}`);
  }
  const avatarData = await avatarRes.json();
  const avatarEntry = avatarData?.data?.[0];

  let avatarUrl = avatarEntry?.imageUrl ?? null;
  if (!avatarUrl || avatarEntry?.state === 'Pending') {
    avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=352&height=352&format=png`;
  }
  if (!avatarUrl) {
    throw new Error('No se pudo obtener el avatar de Roblox');
  }

  const payload = { username: userData.name, avatarUrl };
  profileCache.set(cacheKey, payload);
  return payload;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function extractInitials(username) {
  if (!username) {
    return '?';
  }
  const normalized = String(username)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .filter(Boolean);
  if (normalized.length === 0) {
    return '?';
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  return normalized.join('');
}

function drawAvatarFallback(ctx, x, y, size, username) {
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, '#1C2338');
  gradient.addColorStop(1, '#0F1423');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);

  const overlay = ctx.createRadialGradient(
    x + size * 0.5,
    y + size * 0.5,
    size * 0.1,
    x + size * 0.5,
    y + size * 0.5,
    size * 0.65
  );
  overlay.addColorStop(0, 'rgba(0, 255, 168, 0.25)');
  overlay.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
  ctx.fillStyle = overlay;
  ctx.fillRect(x, y, size, size);

  const initials = extractInitials(username);
  ctx.fillStyle = '#00FFA8';
  ctx.font = `bold ${Math.floor(size * 0.45)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, x + size / 2, y + size / 2);
}

function drawBlob(ctx, cx, cy, r, fill) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  g.addColorStop(0, fill);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function buildSlightRoundedStar(ctx, cx, cy, rOuter, rInner, cornerR) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }
  ctx.beginPath();
  ctx.moveTo(pts[9].x, pts[9].y);
  for (let i = 0; i < 10; i += 1) {
    const p = pts[i];
    const n = pts[(i + 1) % 10];
    ctx.arcTo(p.x, p.y, n.x, n.y, cornerR);
  }
  ctx.closePath();
}

function drawStarsStrongSlightlyRounded(ctx, x, y, count, r, rating, gap = 12) {
  const rOuter = r;
  const rInner = r * 0.52;
  const cornerR = Math.max(1.4, r * 0.12);
  const fillStrong = '#FFC83D';
  const strokeStrong = '#E09B1A';

  for (let i = 0; i < count; i += 1) {
    const cx = x + r + i * (2 * r + gap);
    buildSlightRoundedStar(ctx, cx, y, rOuter, rInner, cornerR);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.7;

    if (rating >= i + 1) {
      ctx.fillStyle = fillStrong;
      ctx.fill();
      ctx.strokeStyle = strokeStrong;
      ctx.stroke();
    } else if (rating > i) {
      const fraction = rating - i;
      ctx.save();
      ctx.clip();
      ctx.fillStyle = fillStrong;
      ctx.fillRect(cx - rOuter, y - rOuter, (2 * rOuter) * fraction, 2 * rOuter);
      ctx.restore();
      ctx.strokeStyle = strokeStrong;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#8E96AA';
      ctx.stroke();
    }
  }
}

function fitTextToWidth(ctx, text, maxWidth, startPx, minPx = 12, weight = 'normal') {
  let size = startPx;
  ctx.font = `${weight} ${size}px Arial`;
  let width = ctx.measureText(text).width;
  while (width > maxWidth && size > minPx) {
    size -= 1;
    ctx.font = `${weight} ${size}px Arial`;
    width = ctx.measureText(text).width;
  }
  if (width > maxWidth) {
    let truncated = text;
    while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return { text: `${truncated}…`, size };
  }
  return { text, size };
}

function resolveRatingLabel(rating, ratingCount) {
  if (!ratingCount) {
    return 'Calificación: N/A';
  }
  return `Calificación: ${rating.toFixed(2)}`;
}


async function renderCard({
  username,
  avatarUrl,
  fallbackAvatarUrl,
  rating = 0,
  ratingCount = 0,
  vouches = 0,
  variant = 'middleman',
  tradesCompleted = 0,
  partnerRobloxUsername = null,
  roleLabel = null,
}) {
  const normalizedVariant = variant === 'member' ? 'member' : 'middleman';

  const canvas = createCanvas(CANVAS_W * SCALE, CANVAS_H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0, '#050913');
  bg.addColorStop(1, '#03060E');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawBlob(ctx, CANVAS_W * 0.17, CANVAS_H * 0.3, 260, 'rgba(60,130,255,0.12)');
  drawBlob(ctx, CANVAS_W * 0.86, CANVAS_H * 0.78, 320, 'rgba(0,255,180,0.1)');
  const vig = ctx.createRadialGradient(
    CANVAS_W * 0.5,
    CANVAS_H * 0.45,
    40,
    CANVAS_W * 0.5,
    CANVAS_H * 0.62,
    CANVAS_W * 0.95
  );
  vig.addColorStop(0, 'rgba(255,255,255,0.05)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const panel = { x: 20, y: 20, w: CANVAS_W - 40, h: CANVAS_H - 40, r: 20 };
  ctx.fillStyle = 'rgba(36,42,58,0.55)';
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, panel.r);
  ctx.fill();
  const strokeGrad = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h);
  strokeGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
  strokeGrad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 2;
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, panel.r);
  ctx.stroke();

  const PADDING = 22;
  const maxAvatarSize = Math.min(120, panel.h - PADDING * 2);
  const avatarSize = Math.max(80, maxAvatarSize);
  const avatarX = panel.x + PADDING;
  const avatarY = panel.y + (panel.h - avatarSize) / 2;
  const contentStartX = avatarX + avatarSize + 24;
  const contentEndX = panel.x + panel.w - PADDING;
  const availableContentWidth = contentEndX - contentStartX;

  let avatarImg = null;
  const attemptedSources = [avatarUrl, fallbackAvatarUrl].filter((value, index, array) => value && array.indexOf(value) === index);
  for (let i = 0; i < attemptedSources.length; i += 1) {
    const source = attemptedSources[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      avatarImg = await loadRobloxImage(source);
      if (i > 0) {
        logger.info('Avatar de Roblox cargado utilizando URL alternativa', { source });
      }
      break;
    } catch (error) {
      const logPayload = { source, error: error?.message ?? error };
      if (i === attemptedSources.length - 1) {
        logger.error('No se pudo cargar avatar de Roblox, se usará placeholder', logPayload);
        avatarImg = null;
      } else {
        logger.warn('Fallo al cargar avatar de Roblox, reintentando', logPayload);

      }
    }
  }

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.filter = 'blur(6px)';
  ctx.beginPath();
  ctx.ellipse(avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 3, avatarSize / 2, avatarSize / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    drawAvatarFallback(ctx, avatarX, avatarY, avatarSize, username);
  }
  ctx.restore();

  ctx.strokeStyle = normalizedVariant === 'member' ? '#FFD166' : '#00FFA8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 1, 0, Math.PI * 2);
  ctx.stroke();

  const centerY = panel.y + panel.h / 2;
  let usernameAreaWidth = availableContentWidth * 0.6;
  let metricStartX = contentEndX;
  let ratingStarSize = 0;

  if (normalizedVariant === 'middleman') {
    const minStarSize = 12;
    const maxStarSize = 22;
    const optimalStarSize = Math.floor(panel.h * 0.1);
    let starSize = clamp(optimalStarSize, minStarSize, maxStarSize);
    let starGap = Math.max(8, starSize * 0.6);
    const minLabelSize = 14;
    const maxLabelSize = 24;
    const optimalLabelSize = Math.floor(starSize * 1.6);
    let labelSize = clamp(optimalLabelSize, minLabelSize, maxLabelSize);

    const ratingLabel = resolveRatingLabel(rating, ratingCount);

    const calcStarsWidth = () => 5 * (starSize * 2) + 4 * starGap;
    const calcLabelWidth = () => {
      ctx.font = `bold ${labelSize}px Arial`;
      return ctx.measureText(ratingLabel).width;
    };
    const labelPadding = 16;
    const totalRatingWidth = () => calcLabelWidth() + labelPadding + calcStarsWidth();

    while (totalRatingWidth() > availableContentWidth * 0.6 && starSize > minStarSize) {
      starSize -= 1;
      starGap = Math.max(6, starSize * 0.6);
      labelSize = Math.max(minLabelSize, Math.floor(starSize * 1.6));
    }

    const ratingBlockWidth = totalRatingWidth();
    metricStartX = contentEndX - ratingBlockWidth;
    usernameAreaWidth = metricStartX - contentStartX - 20;

    ctx.font = `bold ${labelSize}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(ratingLabel, metricStartX, centerY);

    const starsStartX = metricStartX + calcLabelWidth() + labelPadding;
    drawStarsStrongSlightlyRounded(ctx, starsStartX, centerY, 5, starSize, rating, starGap);
    ratingStarSize = starSize;
  } else {
    const metricWidth = Math.min(Math.max(availableContentWidth * 0.45, 220), availableContentWidth * 0.75);
    metricStartX = contentEndX - metricWidth;
    usernameAreaWidth = metricStartX - contentStartX - 20;
    const partnerLabel = 'Último trade con';
    const partnerValue = partnerRobloxUsername ? `@${partnerRobloxUsername}` : 'Sin registro';
    const labelSize = clamp(Math.floor(panel.h * 0.12), 16, 22);
    ctx.font = `bold ${labelSize}px Arial`;
    ctx.fillStyle = '#AEB7D1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const labelY = centerY - 6;
    ctx.fillText(partnerLabel, metricStartX, labelY);

    const valueStartSize = Math.floor(labelSize * 1.4);
    const partnerFit = fitTextToWidth(ctx, partnerValue, metricWidth, valueStartSize, 16, 'bold');
    ctx.font = `bold ${partnerFit.size}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.fillText(partnerFit.text, metricStartX, labelY + 8);
  }

  usernameAreaWidth = Math.max(140, Math.min(usernameAreaWidth, availableContentWidth - 20));
  const usernameText = username ? `@${username}` : 'Usuario desconocido';
  const usernameFit = fitTextToWidth(ctx, usernameText, usernameAreaWidth, Math.floor(panel.h * 0.25), 16, 'bold');

  const usernameAreaTop = panel.y + PADDING;
  const usernameAreaHeight = panel.h - PADDING * 2;
  const usernameTopMargin = Math.max(8, usernameAreaHeight * 0.15);
  ctx.font = `bold ${usernameFit.size}px Arial`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const usernameY = usernameAreaTop + usernameTopMargin;
  ctx.fillText(usernameFit.text, contentStartX, usernameY);

  const highlightValue = normalizedVariant === 'middleman' ? Math.max(0, vouches ?? 0) : Math.max(0, tradesCompleted ?? 0);
  const highlightText =
    normalizedVariant === 'middleman'
      ? `Vouches +${highlightValue}`
      : `Trades completados ${highlightValue}`;
  const minVouchesSize = 12;
  const maxVouchesSize = 20;
  let vouchesSize = clamp(Math.floor(usernameFit.size * 0.7), minVouchesSize, maxVouchesSize);
  ctx.font = `bold ${vouchesSize}px Arial`;
  let vouchesTextWidth = ctx.measureText(highlightText).width;
  const vouchesPadX = 16;
  const vouchesPadY = 8;
  let vouchesBoxWidth = vouchesTextWidth + vouchesPadX * 2;
  const vouchesBoxHeight = vouchesSize + vouchesPadY * 2;
  while (vouchesBoxWidth > usernameAreaWidth && vouchesSize > minVouchesSize) {
    vouchesSize -= 1;
    ctx.font = `bold ${vouchesSize}px Arial`;
    vouchesTextWidth = ctx.measureText(highlightText).width;
    vouchesBoxWidth = vouchesTextWidth + vouchesPadX * 2;
  }

  const vouchesMarginTop = Math.max(12, usernameFit.size * 0.4);
  const vouchesY = usernameY + usernameFit.size + vouchesMarginTop;
  const maxVouchesY = panel.y + panel.h - PADDING - vouchesBoxHeight;
  const finalVouchesY = Math.min(vouchesY, maxVouchesY);

  const highlightFill = normalizedVariant === 'middleman' ? 'rgba(18,24,36,0.9)' : 'rgba(54,32,12,0.92)';
  const highlightStroke = normalizedVariant === 'middleman' ? '#00FFA8' : '#FFD166';
  const highlightTextColor = highlightStroke;
  roundRect(ctx, contentStartX, finalVouchesY, vouchesBoxWidth, vouchesBoxHeight, 12);
  ctx.fillStyle = highlightFill;
  ctx.fill();
  ctx.strokeStyle = highlightStroke;
  ctx.lineWidth = 2;
  roundRect(ctx, contentStartX, finalVouchesY, vouchesBoxWidth, vouchesBoxHeight, 12);
  ctx.stroke();
  ctx.fillStyle = highlightTextColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${vouchesSize}px Arial`;
  ctx.fillText(highlightText, contentStartX + vouchesBoxWidth / 2, finalVouchesY + vouchesBoxHeight / 2);

  const badgeGap = 8;
  const badgeHeight = 28;
  const badgePadX = 14;
  const badgePadY = 6;
  const badgeRadius = 8;
  const badgeFont = 13;
  const badgeBottomMargin = 12;
  const badgeBaseY = panel.y + panel.h - badgeBottomMargin - badgeHeight;

  const discordText = 'discord.gg/dedos';
  ctx.font = `bold ${badgeFont}px Arial`;
  const discordTextWidth = ctx.measureText(discordText).width;
  const discordBadgeWidth = discordTextWidth + badgePadX * 2;
  const discordBadgeX = panel.x + panel.w - PADDING - discordBadgeWidth;
  ctx.fillStyle = 'rgba(88,101,242,0.15)';
  roundRect(ctx, discordBadgeX, badgeBaseY, discordBadgeWidth, badgeHeight, badgeRadius);
  ctx.fill();
  ctx.strokeStyle = '#5865F2';
  ctx.lineWidth = 1.5;
  roundRect(ctx, discordBadgeX, badgeBaseY, discordBadgeWidth, badgeHeight, badgeRadius);
  ctx.stroke();
  ctx.fillStyle = '#5865F2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(discordText, discordBadgeX + discordBadgeWidth / 2, badgeBaseY + badgeHeight / 2);

  const badgeText = (roleLabel ?? (normalizedVariant === 'middleman' ? 'middleman' : 'miembro')).toString();
  ctx.font = `bold ${badgeFont}px Arial`;
  const middlemanTextWidth = ctx.measureText(badgeText).width;
  const middlemanBadgeWidth = middlemanTextWidth + badgePadX * 2;
  const middlemanBadgeX = discordBadgeX - badgeGap - middlemanBadgeWidth;
  const badgeFill = normalizedVariant === 'middleman' ? 'rgba(29,161,242,0.15)' : 'rgba(255,196,86,0.22)';
  const badgeStroke = normalizedVariant === 'middleman' ? '#1DA1F2' : '#FFB547';
  const badgeTextColor = badgeStroke;
  roundRect(ctx, middlemanBadgeX, badgeBaseY, middlemanBadgeWidth, badgeHeight, badgeRadius);
  ctx.fillStyle = badgeFill;
  ctx.fill();
  ctx.strokeStyle = badgeStroke;
  ctx.lineWidth = 1.5;
  roundRect(ctx, middlemanBadgeX, badgeBaseY, middlemanBadgeWidth, badgeHeight, badgeRadius);
  ctx.stroke();
  ctx.fillStyle = badgeTextColor;
  ctx.fillText(badgeText, middlemanBadgeX + middlemanBadgeWidth / 2, badgeBaseY + badgeHeight / 2);

  if (normalizedVariant === 'middleman' && ratingCount) {
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#AEB7D1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const reviewsLabel = `${ratingCount} reseña${ratingCount === 1 ? '' : 's'}`;
    ctx.fillText(reviewsLabel, metricStartX, centerY + ratingStarSize + 16);
  }

  const buffer = canvas.toBuffer('image/png');
  const fileName = normalizedVariant === 'middleman' ? 'middleman_card.png' : 'member_card.png';
  return new AttachmentBuilder(buffer, { name: fileName });
}

async function generateCardForRobloxUser({
  robloxUsername,
  robloxUserId,
  displayUsername = null,
  variant = 'middleman',
  rating = 0,
  ratingCount = 0,
  vouches = 0,
  tradesCompleted = 0,
  partnerRobloxUsername = null,
  roleLabel = null,
}) {
  let resolvedUserId = robloxUserId;
  if (!resolvedUserId && robloxUsername) {
    resolvedUserId = await getUserIdFromUsername(robloxUsername);
  }
  if (!resolvedUserId) {
    throw new Error('No se pudo resolver el usuario de Roblox para la tarjeta');
  }
  const info = await getRobloxInfo(resolvedUserId);
  const fallbackAvatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${resolvedUserId}&width=352&height=352&format=png`;
  const card = await renderCard({
    username: displayUsername ?? robloxUsername ?? info.username,
    avatarUrl: info.avatarUrl,
    fallbackAvatarUrl,
    rating: clamp(Number.isFinite(rating) ? rating : 0, 0, 5),
    ratingCount: Number.isFinite(ratingCount) ? Math.max(0, ratingCount) : 0,
    vouches: Math.max(0, vouches ?? 0),
    variant,
    tradesCompleted: Math.max(0, tradesCompleted ?? 0),
    partnerRobloxUsername,
    roleLabel,
  });
  return card;
}

export async function generateForRobloxUser({ robloxUsername, robloxUserId, rating = 0, ratingCount = 0, vouches = 0 }) {
  return generateCardForRobloxUser({
    robloxUsername,
    robloxUserId,
    variant: 'middleman',
    rating,
    ratingCount,
    vouches,
    roleLabel: 'middleman',
  });
}

export async function generateMemberCard({
  robloxUsername,
  robloxUserId,
  tradesCompleted = 0,
  partnerRobloxUsername = null,
}) {
  return generateCardForRobloxUser({
    robloxUsername,
    robloxUserId,
    displayUsername: robloxUsername ?? undefined,
    variant: 'member',
    tradesCompleted,
    partnerRobloxUsername,
    roleLabel: 'miembro',
  });
}
