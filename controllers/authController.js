const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

/**
 * Register a new student user
 */
const register = async (req, res, next) => {
  try {
    const { email, password, full_name, college_name } = req.body;

    // Check if user already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please sign in instead.'
      });
    }

    // Securely hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert user record
    const [userResult] = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, password_hash]
    );

    const userId = userResult.insertId;

    // Create default student profile record
    await pool.query(
      `INSERT INTO student_profiles (user_id, full_name, college_name, target_roles) 
       VALUES (?, ?, ?, ?)`,
      [
        userId,
        full_name,
        college_name,
        JSON.stringify(['Full-Stack Developer', 'Software Engineer'])
      ]
    );

    // Sign JWT token
    const token = jwt.sign(
      { id: userId, email },
      process.env.JWT_SECRET || 'skillbadge_super_secure_jwt_secret_key_2026_change_in_production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Student account created successfully.',
      token,
      user: {
        id: userId,
        email,
        full_name,
        college_name,
        degree: 'B.Tech / Bachelor of Science',
        graduation_year: 2026,
        target_roles: ['Full-Stack Developer', 'Software Engineer']
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login existing student user
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Query user by email
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = users[0];

    // Verify password with bcrypt
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Fetch student profile
    const [profiles] = await pool.query('SELECT * FROM student_profiles WHERE user_id = ?', [user.id]);
    const profile = profiles[0] || {};

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

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'skillbadge_super_secure_jwt_secret_key_2026_change_in_production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: profile.full_name || 'Student',
        college_name: profile.college_name || '',
        degree: profile.degree || '',
        graduation_year: profile.graduation_year || 2026,
        department: profile.department || '',
        bio: profile.bio || '',
        target_roles: targetRoles,
        github_url: profile.github_url || '',
        linkedin_url: profile.linkedin_url || '',
        portfolio_url: profile.portfolio_url || ''
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current authenticated student user info
 */
const getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [users] = await pool.query('SELECT id, email, created_at FROM users WHERE id = ?', [userId]);
    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    const [profiles] = await pool.query('SELECT * FROM student_profiles WHERE user_id = ?', [userId]);
    const profile = profiles[0] || {};

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

    return res.json({
      success: true,
      user: {
        id: users[0].id,
        email: users[0].email,
        created_at: users[0].created_at,
        full_name: profile.full_name || 'Student',
        college_name: profile.college_name || '',
        degree: profile.degree || '',
        graduation_year: profile.graduation_year || 2026,
        department: profile.department || '',
        bio: profile.bio || '',
        target_roles: targetRoles,
        github_url: profile.github_url || '',
        linkedin_url: profile.linkedin_url || '',
        portfolio_url: profile.portfolio_url || ''
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe
};
