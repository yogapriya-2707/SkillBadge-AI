const { pool } = require('../config/db');

/**
 * Format raw MySQL experience row into clean client object
 */
const formatExperience = (exp) => {
  if (!exp) return null;
  let tech = [];
  if (exp.technologies_used) {
    try {
      tech = typeof exp.technologies_used === 'string'
        ? JSON.parse(exp.technologies_used)
        : exp.technologies_used;
    } catch (e) {
      tech = [];
    }
  }

  return {
    ...exp,
    is_current: Boolean(exp.is_current),
    technologies_used: Array.isArray(tech) ? tech : []
  };
};

/**
 * Helper to normalize technologies array from user input
 */
const parseTechnologies = (input) => {
  if (Array.isArray(input)) {
    return input.map(t => String(t).trim()).filter(Boolean);
  }
  if (typeof input === 'string' && input.trim()) {
    return input.split(',').map(t => t.trim()).filter(Boolean);
  }
  return [];
};

/**
 * GET /api/experiences
 * List all experiences for current authenticated student
 */
const getExperiences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { category } = req.query;

    let query = 'SELECT * FROM experiences WHERE user_id = ?';
    const params = [userId];

    if (category && typeof category === 'string' && category.trim()) {
      query += ' AND (category = ? OR LOWER(category) = LOWER(?))';
      params.push(category.trim(), category.trim());
    }

    query += ' ORDER BY start_date DESC, created_at DESC';

    const [rows] = await pool.query(query, params);
    const experiences = rows.map(formatExperience);

    return res.json({
      success: true,
      count: experiences.length,
      experiences
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/experiences/:id
 * Retrieve a single experience by ID (strictly isolated to owner)
 */
const getExperienceById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM experiences WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found or unauthorized.'
      });
    }

    return res.json({
      success: true,
      experience: formatExperience(rows[0])
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/experiences
 * Create a new student experience
 */
const createExperience = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      title,
      category,
      organization,
      role_title,
      start_date,
      end_date,
      is_current,
      description,
      outcome_metrics,
      technologies_used,
      evidence_url
    } = req.body;

    const techArray = parseTechnologies(technologies_used);
    const techJson = JSON.stringify(techArray);

    const [result] = await pool.query(
      `INSERT INTO experiences 
        (user_id, title, category, organization, role_title, start_date, end_date, is_current, description, outcome_metrics, technologies_used, evidence_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        title,
        category,
        organization || null,
        role_title || null,
        start_date || null,
        is_current ? null : (end_date || null),
        Boolean(is_current),
        description,
        outcome_metrics || null,
        techJson,
        evidence_url || null
      ]
    );

    const [createdRows] = await pool.query(
      'SELECT * FROM experiences WHERE id = ? AND user_id = ?',
      [result.insertId, userId]
    );

    return res.status(201).json({
      success: true,
      message: 'Experience logged successfully.',
      experience: formatExperience(createdRows[0])
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/experiences/:id
 * Update an existing experience (strictly isolated to owner)
 */
const updateExperience = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      title,
      category,
      organization,
      role_title,
      start_date,
      end_date,
      is_current,
      description,
      outcome_metrics,
      technologies_used,
      evidence_url
    } = req.body;

    // Check ownership first
    const [existing] = await pool.query(
      'SELECT id FROM experiences WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found or unauthorized.'
      });
    }

    const techArray = parseTechnologies(technologies_used);
    const techJson = JSON.stringify(techArray);

    await pool.query(
      `UPDATE experiences 
       SET title = ?, 
           category = ?, 
           organization = ?, 
           role_title = ?, 
           start_date = ?, 
           end_date = ?, 
           is_current = ?, 
           description = ?, 
           outcome_metrics = ?, 
           technologies_used = ?, 
           evidence_url = ?
       WHERE id = ? AND user_id = ?`,
      [
        title,
        category,
        organization || null,
        role_title || null,
        start_date || null,
        is_current ? null : (end_date || null),
        Boolean(is_current),
        description,
        outcome_metrics || null,
        techJson,
        evidence_url || null,
        id,
        userId
      ]
    );

    const [updatedRows] = await pool.query(
      'SELECT * FROM experiences WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    return res.json({
      success: true,
      message: 'Experience updated successfully.',
      experience: formatExperience(updatedRows[0])
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/experiences/:id
 * Delete an experience (strictly isolated to owner)
 */
const deleteExperience = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM experiences WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found or unauthorized.'
      });
    }

    return res.json({
      success: true,
      message: 'Experience deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExperiences,
  getExperienceById,
  createExperience,
  updateExperience,
  deleteExperience
};
