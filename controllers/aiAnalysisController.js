const { pool } = require('../config/db');
const aiService = require('../services/aiService');

/**
 * POST /api/ai/analyze-skills
 * Extract evidence-based skills from the authenticated student's experiences.
 */
const analyzeSkills = async (req, res, next) => {
  let connection;
  try {
    const userId = req.user.id;

    // 1. Fetch user profile and experiences (strictly scoped to authenticated user)
    const [profiles] = await pool.query('SELECT * FROM student_profiles WHERE user_id = ?', [userId]);
    const profile = profiles[0] || {};

    const [experiences] = await pool.query(
      'SELECT * FROM experiences WHERE user_id = ? ORDER BY start_date DESC, created_at DESC LIMIT 100',
      [userId]
    );

    if (!experiences || experiences.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No experiences found to analyze. Please log projects, hackathons, or activities first.'
      });
    }

    // Parse technologies_used for each experience
    const parsedExperiences = experiences.map((exp) => ({
      ...exp,
      technologies_used: typeof exp.technologies_used === 'string'
        ? JSON.parse(exp.technologies_used || '[]')
        : (exp.technologies_used || [])
    }));

    // 2. Run modular extraction engine
    const extractionResult = await aiService.analyzeExperiences(parsedExperiences, profile);
    const extractedSkills = extractionResult.skills || [];

    if (extractedSkills.length === 0) {
      return res.json({
        success: true,
        message: 'Analysis completed, but no standard competencies could be extracted from the current descriptions. Try adding specific tools, frameworks, and outcome metrics to your experiences.',
        providerUsed: extractionResult.providerUsed,
        providerLabel: extractionResult.providerLabel,
        skills: []
      });
    }

    // 3. Persist skills and experience_skills mapping within a safe transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    for (const skill of extractedSkills) {
      // Upsert skill in `skills` table
      await connection.query(
        `INSERT INTO skills (user_id, name, category, score, proficiency_level, evidence_count, last_evaluated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
          category = VALUES(category),
          score = VALUES(score),
          proficiency_level = VALUES(proficiency_level),
          evidence_count = VALUES(evidence_count),
          last_evaluated_at = NOW()`,
        [
          userId,
          skill.name,
          skill.category,
          skill.score,
          skill.proficiency_level,
          skill.evidence_count
        ]
      );

      // Get the skill ID
      const [skillRows] = await connection.query(
        'SELECT id FROM skills WHERE user_id = ? AND name = ?',
        [userId, skill.name]
      );

      if (skillRows.length > 0) {
        const skillId = skillRows[0].id;

        // Upsert M:N relationships in `experience_skills`
        if (Array.isArray(skill.supportingExperiences)) {
          for (const supp of skill.supportingExperiences) {
            // Verify experience belongs to user
            const expExists = parsedExperiences.find((e) => e.id === supp.experience_id);
            if (expExists) {
              await connection.query(
                `INSERT INTO experience_skills 
                  (experience_id, skill_id, contribution_level, context_snippet)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  contribution_level = VALUES(contribution_level),
                  context_snippet = VALUES(context_snippet)`,
                [
                  supp.experience_id,
                  skillId,
                  supp.contribution_level || 'Primary',
                  supp.context_snippet || `Demonstrated in ${expExists.title}`
                ]
              );
            }
          }
        }
      }
    }

    await connection.commit();

    // 4. Return refreshed skills list with supporting experience context
    const skillsWithEvidence = await fetchUserSkillsWithEvidence(userId);

    return res.json({
      success: true,
      message: 'Skills extracted and mapped to supporting experiences successfully.',
      providerUsed: extractionResult.providerUsed,
      providerLabel: extractionResult.providerLabel,
      isRuleBasedFallback: extractionResult.providerUsed === 'local-rules-engine',
      count: skillsWithEvidence.length,
      skills: skillsWithEvidence
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * Helper to fetch all skills for a user including joined supporting experiences
 */
const fetchUserSkillsWithEvidence = async (userId) => {
  const [skills] = await pool.query(
    'SELECT * FROM skills WHERE user_id = ? ORDER BY score DESC, evidence_count DESC',
    [userId]
  );

  if (skills.length === 0) return [];

  // Fetch all experience_skills for this user's skills
  const skillIds = skills.map((s) => s.id);
  const [links] = await pool.query(
    `SELECT 
      es.skill_id, 
      es.contribution_level, 
      es.context_snippet, 
      e.id AS experience_id, 
      e.title AS experience_title, 
      e.category AS experience_category,
      e.organization,
      e.evidence_url
     FROM experience_skills es
     JOIN experiences e ON es.experience_id = e.id
     WHERE es.skill_id IN (?) AND e.user_id = ?`,
    [skillIds, userId]
  );

  return skills.map((skill) => {
    const supporting = links.filter((link) => link.skill_id === skill.id);
    return {
      ...skill,
      supportingExperiences: supporting.map((s) => ({
        experience_id: s.experience_id,
        experience_title: s.experience_title,
        experience_category: s.experience_category,
        organization: s.organization,
        contribution_level: s.contribution_level,
        context_snippet: s.context_snippet,
        evidence_url: s.evidence_url
      }))
    };
  });
};

/**
 * GET /api/ai/skills
 * Retrieve all skills and their mapped experiences for the authenticated student.
 */
const getSkills = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const skills = await fetchUserSkillsWithEvidence(userId);
    const status = aiService.getStatus();

    return res.json({
      success: true,
      count: skills.length,
      status,
      skills
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  analyzeSkills,
  getSkills
};
