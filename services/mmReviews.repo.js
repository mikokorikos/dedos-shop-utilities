import { pool } from './db.js';
import { normalizeSnowflake } from '../utils/snowflake.js';

export class DuplicateReviewError extends Error {
  constructor(message = 'Duplicate review') {
    super(message);
    this.name = 'DuplicateReviewError';
  }
}

export async function createReview({ ticketId, reviewerUserId, middlemanUserId, stars, reviewText }) {
  const reviewer = normalizeSnowflake(reviewerUserId, { label: 'reviewerUserId' });
  const middleman = normalizeSnowflake(middlemanUserId, { label: 'middlemanUserId' });
  try {
    const [result] = await pool.query(
      'INSERT INTO mm_reviews (ticket_id, reviewer_user_id, middleman_user_id, stars, review_text) VALUES (?, ?, ?, ?, ?)',
      [ticketId, reviewer, middleman, stars, reviewText ?? null]
    );
    return result.insertId;
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new DuplicateReviewError();
    }
    throw error;
  }
}

export async function countReviewsForTicket(ticketId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM mm_reviews WHERE ticket_id = ?', [ticketId]);
  return rows[0]?.total ?? 0;
}

export async function getReviewsForTicket(ticketId) {
  const [rows] = await pool.query('SELECT * FROM mm_reviews WHERE ticket_id = ?', [ticketId]);
  return rows;
}

export async function hasReviewFromUser(ticketId, reviewerUserId) {
  const reviewer = normalizeSnowflake(reviewerUserId, { label: 'reviewerUserId' });
  const [rows] = await pool.query(
    'SELECT 1 FROM mm_reviews WHERE ticket_id = ? AND reviewer_user_id = ? LIMIT 1',
    [ticketId, reviewer]
  );
  return Boolean(rows[0]);
}
