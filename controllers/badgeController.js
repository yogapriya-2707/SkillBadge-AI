const crypto = require('crypto');
const { pool } = require('../config/db');

/**
 * Format badge record for API responses (safely parsing JSON)
 */
const formatBadge = (badge) => {
  let evidenceSummary = badge.evidence_summary;
  if (typeof evidenceSummary === 'string') {
    try {
      evidenceSummary = JSON.parse(evidenceSummary || '{}');
    } catch {
      evidenceSummary = {};
    }
  }

  return {
    ...badge,
    evidence_summary: evidenceSummary
  };
};

/**
 * Get all badges for the logged-in student
 */
const getBadges = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [badges] = await pool.query(
      `SELECT * FROM digital_badges 
       WHERE user_id = ? 
       ORDER BY 
         CASE tier 
           WHEN 'Platinum' THEN 4 
           WHEN 'Gold' THEN 3 
           WHEN 'Silver' THEN 2 
           WHEN 'Bronze' THEN 1 
           ELSE 0 
         END DESC, 
         score DESC, 
         created_at DESC`,
      [userId]
    );

    const formatted = badges.map(formatBadge);

    return res.json({
      success: true,
      count: formatted.length,
      badges: formatted
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific badge by ID for the logged-in student
 */
const getBadgeById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [badges] = await pool.query(
      'SELECT * FROM digital_badges WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!badges || badges.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Badge not found or unauthorized.'
      });
    }

    return res.json({
      success: true,
      badge: formatBadge(badges[0])
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper: Determine Tier based on score and evidence rigor
 */
const evaluateTier = (score, experiencesCount, hasEvidenceUrl = false) => {
  if (score >= 85 && experiencesCount >= 3 && hasEvidenceUrl) {
    return 'Platinum';
  }
  if (score >= 75 && experiencesCount >= 2) {
    return 'Gold';
  }
  if (score >= 65 && (experiencesCount >= 2 || hasEvidenceUrl)) {
    return 'Silver';
  }
  if (score >= 50 && experiencesCount >= 1) {
    return 'Bronze';
  }
  return null;
};

/**
 * Generate/recalculate evidence-based digital badges based on current skills and linked experiences
 */
const generateBadges = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;

    // 1. Fetch user skills joined with their supporting experiences
    const [rows] = await connection.query(
      `SELECT 
         s.id AS skill_id,
         s.name AS skill_name,
         s.category AS skill_category,
         s.proficiency_level,
         s.score AS skill_score,
         s.evidence_count,
         e.id AS exp_id,
         e.title AS exp_title,
         e.category AS exp_category,
         e.role_title AS exp_role,
         e.evidence_url AS exp_evidence_url,
         es.contribution_level,
         es.context_snippet
       FROM skills s
       LEFT JOIN experience_skills es ON s.id = es.skill_id
       LEFT JOIN experiences e ON es.experience_id = e.id AND e.user_id = ?
       WHERE s.user_id = ?
       ORDER BY s.id`,
      [userId, userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No skills found to generate badges. Please add experiences and run AI skill analysis first.'
      });
    }

    // 2. Group skills and their linked experiences
    const skillsMap = new Map();
    for (const row of rows) {
      if (!skillsMap.has(row.skill_id)) {
        skillsMap.set(row.skill_id, {
          id: row.skill_id,
          name: row.skill_name,
          category: row.skill_category,
          proficiency_level: row.proficiency_level,
          score: row.skill_score,
          evidence_count: row.evidence_count,
          experiences: []
        });
      }

      if (row.exp_id) {
        const skill = skillsMap.get(row.skill_id);
        const alreadyAdded = skill.experiences.some(e => e.id === row.exp_id);
        if (!alreadyAdded) {
          skill.experiences.push({
            id: row.exp_id,
            title: row.exp_title,
            category: row.exp_category,
            role: row.exp_role,
            evidenceUrl: row.exp_evidence_url,
            contributionLevel: row.contribution_level || 'Primary',
            contextSnippet: row.context_snippet || ''
          });
        }
      }
    }

    const allSkills = Array.from(skillsMap.values());

    // Check if there is at least one verified experience linked to any skill
    const totalLinkedExperiences = allSkills.reduce((acc, s) => acc + s.experiences.length, 0);
    if (totalLinkedExperiences === 0) {
      return res.status(400).json({
        success: false,
        message: 'No verified experiences found supporting your skills. Badges require concrete project or event evidence.'
      });
    }

    // 3. Define candidate badge definitions
    const badgeCandidates = [];

    // Helper to find skills by name regex
    const findSkill = (regex) => allSkills.find(s => regex.test(s.name));
    const filterSkills = (regex) => allSkills.filter(s => regex.test(s.name));

    // A. Domain Composite Badges
    // 1. Full-Stack Web Development
    const frontendSkills = filterSkills(/(react|vue|angular|javascript|typescript|html|css|tailwind)/i);
    const backendSkills = filterSkills(/(node|express|python|fastapi|django|mysql|postgresql|mongodb|rest)/i);
    if (frontendSkills.length > 0 && backendSkills.length > 0) {
      const combinedSkills = [...frontendSkills, ...backendSkills];
      const combinedExpsMap = new Map();
      combinedSkills.forEach(s => s.experiences.forEach(e => combinedExpsMap.set(e.id, e)));
      const combinedExps = Array.from(combinedExpsMap.values());

      if (combinedExps.length >= 1) {
        const avgScore = Math.round(
          combinedSkills.reduce((acc, s) => acc + s.score, 0) / combinedSkills.length
        );
        const hasUrl = combinedExps.some(e => Boolean(e.evidenceUrl));
        const tier = evaluateTier(avgScore, combinedExps.length, hasUrl);

        if (tier) {
          badgeCandidates.push({
            title: 'Full-Stack Web Development',
            category: 'Technical Skills',
            tier,
            score: avgScore,
            criteria: `Demonstrated cross-stack proficiency across frontend and backend systems in ${combinedExps.length} verified projects with an average score of ${avgScore}/100.`,
            skills: combinedSkills.map(s => ({ name: s.name, score: s.score })),
            experiences: combinedExps
          });
        }
      }
    }

    // 2. Backend Systems & API Engineering
    const serverSkills = filterSkills(/(node|express|python|fastapi|django|java|spring|rest|sql|mysql|postgresql)/i);
    if (serverSkills.length > 0) {
      const serverExpsMap = new Map();
      serverSkills.forEach(s => s.experiences.forEach(e => serverExpsMap.set(e.id, e)));
      const serverExps = Array.from(serverExpsMap.values());

      if (serverExps.length >= 1) {
        const avgScore = Math.round(
          serverSkills.reduce((acc, s) => acc + s.score, 0) / serverSkills.length
        );
        const hasUrl = serverExps.some(e => Boolean(e.evidenceUrl));
        const tier = evaluateTier(avgScore, serverExps.length, hasUrl);

        if (tier) {
          badgeCandidates.push({
            title: 'Backend Systems & API Engineering',
            category: 'Technical Skills',
            tier,
            score: avgScore,
            criteria: `Demonstrated server-side architecture and data management in ${serverExps.length} verified experiences with score ${avgScore}/100.`,
            skills: serverSkills.map(s => ({ name: s.name, score: s.score })),
            experiences: serverExps
          });
        }
      }
    }

    // 3. Frontend Architecture & Modern UI
    const clientSkills = filterSkills(/(react|vue|angular|javascript|typescript|tailwind|html|css)/i);
    if (clientSkills.length > 0) {
      const clientExpsMap = new Map();
      clientSkills.forEach(s => s.experiences.forEach(e => clientExpsMap.set(e.id, e)));
      const clientExps = Array.from(clientExpsMap.values());

      if (clientExps.length >= 1) {
        const avgScore = Math.round(
          clientSkills.reduce((acc, s) => acc + s.score, 0) / clientSkills.length
        );
        const hasUrl = clientExps.some(e => Boolean(e.evidenceUrl));
        const tier = evaluateTier(avgScore, clientExps.length, hasUrl);

        if (tier) {
          badgeCandidates.push({
            title: 'Frontend Architecture & Modern UI',
            category: 'Technical Skills',
            tier,
            score: avgScore,
            criteria: `Demonstrated responsive interface construction and state management across ${clientExps.length} verified experiences with score ${avgScore}/100.`,
            skills: clientSkills.map(s => ({ name: s.name, score: s.score })),
            experiences: clientExps
          });
        }
      }
    }

    // 4. Cloud, DevOps & Containerization
    const devopsSkills = filterSkills(/(docker|kubernetes|aws|ci\/cd|linux|git)/i);
    if (devopsSkills.length > 0) {
      const devopsExpsMap = new Map();
      devopsSkills.forEach(s => s.experiences.forEach(e => devopsExpsMap.set(e.id, e)));
      const devopsExps = Array.from(devopsExpsMap.values());

      if (devopsExps.length >= 1) {
        const avgScore = Math.round(
          devopsSkills.reduce((acc, s) => acc + s.score, 0) / devopsSkills.length
        );
        const hasUrl = devopsExps.some(e => Boolean(e.evidenceUrl));
        const tier = evaluateTier(avgScore, devopsExps.length, hasUrl);

        if (tier) {
          badgeCandidates.push({
            title: 'Cloud & DevOps Practitioner',
            category: 'Tools & Frameworks',
            tier,
            score: avgScore,
            criteria: `Demonstrated infrastructure automation, containerization, or version control in ${devopsExps.length} verified projects with score ${avgScore}/100.`,
            skills: devopsSkills.map(s => ({ name: s.name, score: s.score })),
            experiences: devopsExps
          });
        }
      }
    }

    // 5. Collaborative Leadership & Agile Delivery
    const leadSkills = filterSkills(/(leadership|agile|collaboration|communication|problem solving)/i);
    if (leadSkills.length > 0) {
      const leadExpsMap = new Map();
      leadSkills.forEach(s => s.experiences.forEach(e => leadExpsMap.set(e.id, e)));
      const leadExps = Array.from(leadExpsMap.values());

      if (leadExps.length >= 1) {
        const avgScore = Math.round(
          leadSkills.reduce((acc, s) => acc + s.score, 0) / leadSkills.length
        );
        const tier = evaluateTier(avgScore, leadExps.length, false);

        if (tier) {
          badgeCandidates.push({
            title: 'Collaborative Leadership & Team Delivery',
            category: 'Professional Skills',
            tier,
            score: avgScore,
            criteria: `Demonstrated teamwork, project orchestration, or leadership responsibility across ${leadExps.length} verified experiences with score ${avgScore}/100.`,
            skills: leadSkills.map(s => ({ name: s.name, score: s.score })),
            experiences: leadExps
          });
        }
      }
    }

    // B. Standalone Core Competency Badges for prominent individual skills
    for (const skill of allSkills) {
      if (skill.experiences.length >= 1 && skill.score >= 50) {
        const hasUrl = skill.experiences.some(e => Boolean(e.evidenceUrl));
        const tier = evaluateTier(skill.score, skill.experiences.length, hasUrl);

        if (tier) {
          const badgeTitle = `${skill.name} Competency`;
          // Avoid duplicate badge candidate if domain badge covers exact same single-word skill
          if (!badgeCandidates.some(b => b.title === badgeTitle)) {
            badgeCandidates.push({
              title: badgeTitle,
              category: skill.category,
              tier,
              score: skill.score,
              criteria: `Demonstrated practical competency in ${skill.name} with score ${skill.score}/100 across ${skill.experiences.length} verified student experiences.`,
              skills: [{ name: skill.name, score: skill.score }],
              experiences: skill.experiences
            });
          }
        }
      }
    }

    if (badgeCandidates.length === 0) {
      return res.json({
        success: true,
        message: 'No new badges qualified under current evidence criteria. Add more experiences or achieve higher competency scores to earn badges.',
        newBadgesCount: 0,
        upgradedBadgesCount: 0,
        badges: []
      });
    }

    // 4. Begin transaction for safe idempotent upsert
    await connection.beginTransaction();

    // Query existing badges for this user
    const [existingBadges] = await connection.query(
      'SELECT id, badge_uuid, title, tier, score, issued_date FROM digital_badges WHERE user_id = ?',
      [userId]
    );

    const existingMap = new Map();
    for (const eb of existingBadges) {
      existingMap.set(eb.title, eb);
    }

    let newCount = 0;
    let upgradedCount = 0;

    const tierRanks = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };

    for (const candidate of badgeCandidates) {
      const existing = existingMap.get(candidate.title);

      const evidencePayload = {
        criteriaMet: [
          `Score benchmark met: ${candidate.score}/100 (${candidate.tier} Tier)`,
          `Supported by ${candidate.experiences.length} verified student experience(s)`,
          `Key competencies validated: ${candidate.skills.map(s => s.name).join(', ')}`
        ],
        supportingExperiences: candidate.experiences.map(e => ({
          id: e.id,
          title: e.title,
          category: e.category,
          role: e.role,
          evidenceUrl: e.evidenceUrl || null,
          contributionLevel: e.contributionLevel,
          contextSnippet: e.contextSnippet
        })),
        contributingSkills: candidate.skills,
        audit: {
          issuer: 'SkillBadge AI Evidence Engine',
          issuedToUserId: userId,
          evaluationStandard: 'Evidence-backed verified competency',
          accreditationDisclaimer: 'This badge certifies student-documented project evidence within SkillBadge AI and is not an external third-party accreditation.'
        }
      };

      if (!existing) {
        // Create new badge
        const badgeUuid = crypto.randomUUID();
        const verificationHash = crypto
          .createHash('sha256')
          .update(`${userId}:${candidate.title}:${candidate.tier}:${Date.now()}:${badgeUuid}`)
          .digest('hex');

        await connection.query(
          `INSERT INTO digital_badges 
           (user_id, badge_uuid, title, skill_category, tier, score, criteria_summary, evidence_summary, issued_date, verification_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
          [
            userId,
            badgeUuid,
            candidate.title,
            candidate.category,
            candidate.tier,
            candidate.score,
            candidate.criteria,
            JSON.stringify(evidencePayload),
            verificationHash
          ]
        );
        newCount++;
      } else {
        // Upgrade existing badge if score is higher or tier advanced
        const currentRank = tierRanks[existing.tier] || 0;
        const candidateRank = tierRanks[candidate.tier] || 0;

        if (candidateRank > currentRank || candidate.score > existing.score) {
          const verificationHash = crypto
            .createHash('sha256')
            .update(`${userId}:${candidate.title}:${candidate.tier}:${Date.now()}:${existing.badge_uuid}`)
            .digest('hex');

          await connection.query(
            `UPDATE digital_badges 
             SET tier = ?, score = ?, criteria_summary = ?, evidence_summary = ?, verification_hash = ?
             WHERE id = ?`,
            [
              candidate.tier,
              candidate.score,
              candidate.criteria,
              JSON.stringify(evidencePayload),
              verificationHash,
              existing.id
            ]
          );
          upgradedCount++;
        }
      }
    }

    await connection.commit();

    // 5. Fetch updated badge list
    const [allBadges] = await connection.query(
      `SELECT * FROM digital_badges 
       WHERE user_id = ? 
       ORDER BY 
         CASE tier 
           WHEN 'Platinum' THEN 4 
           WHEN 'Gold' THEN 3 
           WHEN 'Silver' THEN 2 
           WHEN 'Bronze' THEN 1 
           ELSE 0 
         END DESC, 
         score DESC, 
         created_at DESC`,
      [userId]
    );

    const formatted = allBadges.map(formatBadge);

    return res.json({
      success: true,
      message: newCount > 0 
        ? `Successfully generated ${newCount} new badge(s)${upgradedCount > 0 ? ` and upgraded ${upgradedCount} badge(s)` : ''}.`
        : upgradedCount > 0 
          ? `Successfully upgraded ${upgradedCount} badge(s) with new evidence.`
          : 'All eligible digital badges are currently up to date.',
      newBadgesCount: newCount,
      upgradedBadgesCount: upgradedCount,
      count: formatted.length,
      badges: formatted
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

/**
 * Publicly verify badge by UUID (no authentication required)
 */
const verifyBadge = async (req, res, next) => {
  try {
    const { uuid } = req.params;

    const [badges] = await pool.query(
      `SELECT b.*, u.email, p.full_name, p.college_name, p.degree, p.graduation_year
       FROM digital_badges b
       JOIN users u ON b.user_id = u.id
       LEFT JOIN student_profiles p ON b.user_id = p.user_id
       WHERE b.badge_uuid = ?`,
      [uuid]
    );

    if (!badges || badges.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Digital badge not found or verification UUID is invalid.'
      });
    }

    const badge = badges[0];
    const formatted = formatBadge(badge);

    return res.json({
      success: true,
      verified: true,
      badge: {
        id: formatted.id,
        badge_uuid: formatted.badge_uuid,
        title: formatted.title,
        skill_category: formatted.skill_category,
        tier: formatted.tier,
        score: formatted.score,
        criteria_summary: formatted.criteria_summary,
        evidence_summary: formatted.evidence_summary,
        issued_date: formatted.issued_date,
        verification_hash: formatted.verification_hash,
        is_public: Boolean(formatted.is_public),
        student: {
          full_name: formatted.full_name || 'Verified Student',
          college_name: formatted.college_name || 'College / University',
          degree: formatted.degree || 'Student',
          graduation_year: formatted.graduation_year
        },
        issuerNotice: {
          platform: 'SkillBadge AI',
          authority: 'Algorithmic Evidence-Grounded Verification',
          disclaimer: 'This badge was earned based on student-documented project, competition, or internship evidence evaluated through SkillBadge AI. It is not an officially accredited diploma or university degree.'
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBadges,
  getBadgeById,
  generateBadges,
  verifyBadge
};

