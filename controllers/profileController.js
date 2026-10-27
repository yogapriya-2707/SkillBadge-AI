const { pool } = require('../config/db');

/**
 * Get the authenticated student's profile
 */
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT 
        p.*, 
        u.email 
       FROM student_profiles p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = ?`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found.'
      });
    }

    const profile = rows[0];

    // Safely parse JSON target_roles
    let targetRoles = [];
    if (profile.target_roles) {
      try {
        targetRoles = typeof profile.target_roles === 'string'
          ? JSON.parse(profile.target_roles)
          : profile.target_roles;
      } catch (e) {
        targetRoles = [];
      }
    }
    profile.target_roles = targetRoles;

    return res.json({
      success: true,
      profile
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update the authenticated student's profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      full_name,
      college_name,
      degree,
      graduation_year,
      department,
      bio,
      target_roles,
      github_url,
      linkedin_url,
      portfolio_url
    } = req.body;

    // Format target_roles into clean array and JSON
    let targetRolesArray = [];
    if (Array.isArray(target_roles)) {
      targetRolesArray = target_roles.map(r => String(r).trim()).filter(Boolean);
    } else if (typeof target_roles === 'string' && target_roles.trim()) {
      targetRolesArray = target_roles.split(',').map(r => r.trim()).filter(Boolean);
    }

    const targetRolesJson = JSON.stringify(targetRolesArray);

    await pool.query(
      `INSERT INTO student_profiles 
        (user_id, full_name, college_name, degree, graduation_year, department, bio, target_roles, github_url, linkedin_url, portfolio_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        full_name = IFNULL(?, full_name),
        college_name = IFNULL(?, college_name),
        degree = IFNULL(?, degree),
        graduation_year = IFNULL(?, graduation_year),
        department = IFNULL(?, department),
        bio = IFNULL(?, bio),
        target_roles = IFNULL(?, target_roles),
        github_url = IFNULL(?, github_url),
        linkedin_url = IFNULL(?, linkedin_url),
        portfolio_url = IFNULL(?, portfolio_url),
        updated_at = NOW()`,
      [
        userId,
        full_name || 'Student',
        college_name || '',
        degree || 'B.Tech / Bachelor of Science',
        graduation_year ? parseInt(graduation_year, 10) : 2026,
        department || 'Computer Science',
        bio || '',
        targetRolesJson,
        github_url || '',
        linkedin_url || '',
        portfolio_url || '',
        // Values for ON DUPLICATE KEY UPDATE:
        full_name,
        college_name,
        degree,
        graduation_year ? parseInt(graduation_year, 10) : null,
        department,
        bio,
        targetRolesJson,
        github_url,
        linkedin_url,
        portfolio_url
      ]
    );

    // Fetch the updated profile to return
    const [updatedRows] = await pool.query(
      `SELECT p.*, u.email 
       FROM student_profiles p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = ?`,
      [userId]
    );

    const updatedProfile = updatedRows[0];
    updatedProfile.target_roles = targetRolesArray;

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      profile: updatedProfile
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile
};
