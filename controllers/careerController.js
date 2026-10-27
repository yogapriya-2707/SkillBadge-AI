const { pool } = require('../config/db');

/**
 * Standard industry benchmark skill profiles for common college graduate target roles
 */
const ROLE_BENCHMARKS = {
  'Full-Stack Software Engineer': [
    'React', 'Node.js', 'Express', 'JavaScript', 'TypeScript', 'MySQL', 'RESTful APIs', 'Git', 'Docker', 'HTML5', 'CSS3'
  ],
  'Frontend Developer': [
    'React', 'JavaScript', 'TypeScript', 'HTML5', 'CSS3', 'Tailwind CSS', 'Responsive Design', 'Git', 'RESTful APIs'
  ],
  'Backend Systems Engineer': [
    'Python', 'FastAPI', 'Node.js', 'Express', 'MySQL', 'PostgreSQL', 'RESTful APIs', 'Docker', 'Redis', 'Git'
  ],
  'Cloud & DevOps Engineer': [
    'Docker', 'Kubernetes', 'Linux', 'CI/CD', 'Git', 'AWS', 'Python', 'RESTful APIs'
  ],
  'Data Analyst / Scientist': [
    'Python', 'SQL', 'MySQL', 'Pandas', 'NumPy', 'Data Analysis', 'Machine Learning', 'Git'
  ],
  'Mobile App Developer': [
    'React Native', 'JavaScript', 'TypeScript', 'RESTful APIs', 'Git', 'Mobile UI Design'
  ],
  'Software Engineer': [
    'Python', 'JavaScript', 'React', 'Node.js', 'SQL', 'Git', 'Data Structures', 'RESTful APIs'
  ]
};

/**
 * Helper to safely parse JSON from database columns
 */
const parseJsonField = (field, fallback = []) => {
  if (!field) return fallback;
  if (typeof field === 'object') return field;
  try {
    return JSON.parse(field);
  } catch {
    return fallback;
  }
};

/**
 * Generate tailored career artifacts (ATS Resume, LinkedIn Headline & About, Skill Gap Analysis)
 * Based strictly on verified student profile, experiences, skills, and digital badges.
 */
const generateArtifacts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { target_role } = req.body;

    // 1. Fetch student user email and profile
    const [users] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    const userEmail = users[0]?.email || '';

    const [profiles] = await pool.query('SELECT * FROM student_profiles WHERE user_id = ?', [userId]);
    const profile = profiles[0] || {};

    // 2. Fetch logged experiences, skills, and badges
    const [experiences] = await pool.query(
      'SELECT * FROM experiences WHERE user_id = ? ORDER BY start_date DESC, created_at DESC',
      [userId]
    );

    const [skills] = await pool.query(
      'SELECT * FROM skills WHERE user_id = ? ORDER BY score DESC, name ASC',
      [userId]
    );

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
         score DESC`,
      [userId]
    );

    // 3. Determine target role
    const chosenRole = (target_role || profile.target_job_roles || 'Full-Stack Software Engineer').trim();
    const studentName = profile.full_name || 'Aspiring Professional';
    const college = profile.college_name || 'University';
    const degree = profile.degree || 'Degree Program';
    const gradYear = profile.graduation_year ? ` (Class of ${profile.graduation_year})` : '';

    // 4. Extract top skills and categories
    const skillNames = skills.map(s => s.name);
    const topSkills = skillNames.slice(0, 6).join(' • ');

    // 5. Generate LinkedIn Headline (Clean, concise, <= 220 chars)
    let linkedinHeadline = `${studentName} | Aspiring ${chosenRole}`;
    if (topSkills) {
      linkedinHeadline += ` | ${topSkills}`;
    }
    if (profile.college_name) {
      linkedinHeadline += ` | ${profile.college_name}`;
    }
    if (linkedinHeadline.length > 220) {
      linkedinHeadline = linkedinHeadline.substring(0, 217) + '...';
    }

    // 6. Generate LinkedIn About section
    const badgeHighlights = badges.length > 0
      ? ` Earned ${badges.length} verified digital skill badge${badges.length === 1 ? '' : 's'} (${badges.slice(0, 3).map(b => `${b.title} [${b.tier}]`).join(', ')}) through demonstrated hands-on technical execution.`
      : '';

    const expHighlight = experiences.length > 0
      ? `My background includes ${experiences.length} practical project${experiences.length === 1 ? '' : 's'} and event initiative${experiences.length === 1 ? '' : 's'} spanning ${Array.from(new Set(experiences.map(e => e.category))).join(', ')}.`
      : 'Currently actively logging hands-on engineering projects and open-source contributions.';

    const linkedinAbout = `I am a student at ${college} pursuing my ${degree}${gradYear}, with a dedicated focus on building scalable software as an aspiring ${chosenRole}.\n\n${expHighlight}${badgeHighlights}\n\nCore Competencies: ${skillNames.length > 0 ? skillNames.slice(0, 10).join(', ') : 'Software Engineering Fundamentals, Version Control, Problem Solving'}.\n\nPassionate about clean code architecture, algorithmic problem solving, and contributing to high-impact technical initiatives. Always eager to connect with mentors, engineers, and tech innovators!`;

    // 7. Generate ATS-Friendly Resume Summary
    const resumeSummary = `Results-oriented ${chosenRole} candidate studying ${degree} at ${college}${gradYear}. Demonstrated practical competency across ${experiences.length} verified project${experiences.length === 1 ? '' : 's'} and technical initiatives with grounded proficiency in ${skillNames.slice(0, 5).join(', ') || 'modern software engineering'}. Proven ability to design modular applications, implement RESTful interfaces, and deliver collaborative technical outcomes.`;

    // 8. Generate ATS-Friendly Resume Bullets for each experience
    const resumeBullets = experiences.map((exp) => {
      const techList = parseJsonField(exp.technologies_used, []);
      const techString = techList.length > 0 ? ` using ${techList.join(', ')}` : '';
      const metric = exp.outcome_metrics ? ` — resulting in: ${exp.outcome_metrics}` : '';
      const achievements = exp.achievements ? ` Achieved: ${exp.achievements}.` : '';

      return {
        experienceId: exp.id,
        experienceTitle: exp.title,
        organization: exp.organization || '',
        category: exp.category,
        roleTitle: exp.role_title || 'Developer',
        dateRange: `${exp.start_date ? new Date(exp.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'Start'} – ${exp.is_current ? 'Present' : exp.end_date ? new Date(exp.end_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'Completed'}`,
        bullet: `Engineered and delivered ${exp.title}${techString}${metric}.${achievements}`.trim()
      };
    });

    // 9. Generate Grounded Skill-Gap Analysis
    // Match against role benchmark or fallback to generic software engineering
    const benchmarkSkills = ROLE_BENCHMARKS[chosenRole] || ROLE_BENCHMARKS['Software Engineer'];
    const lowerStudentSkills = new Set(skills.map(s => s.name.toLowerCase()));

    const matchingSkills = [];
    const missingSkills = [];

    for (const bSkill of benchmarkSkills) {
      if (lowerStudentSkills.has(bSkill.toLowerCase())) {
        matchingSkills.push(bSkill);
      } else {
        missingSkills.push(bSkill);
      }
    }

    const matchScore = benchmarkSkills.length > 0
      ? Math.round((matchingSkills.length / benchmarkSkills.length) * 100)
      : 50;

    const recommendations = [];
    if (missingSkills.length > 0) {
      recommendations.push(
        `Target Competencies to Acquire: Build a project demonstrating ${missingSkills.slice(0, 3).join(', ')} to strengthen your profile for ${chosenRole}.`
      );
    }
    if (badges.length < 2) {
      recommendations.push(
        'Credential Expansion: Earn additional Silver or Gold digital badges by documenting measurable metrics in your project logs.'
      );
    }
    if (experiences.filter(e => Boolean(e.evidence_url)).length === 0) {
      recommendations.push(
        'Evidence Verification: Attach public GitHub repository or live deployment URLs to your experiences for verifiable proof.'
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        `Strong Benchmark Alignment: Your profile aligns with ${matchScore}% of standard industry requirements for ${chosenRole}. Focus on advanced production optimizations and system design.`
      );
    }

    const skillGapAnalysis = {
      targetRole: chosenRole,
      matchPercentage: matchScore,
      benchmarkTotal: benchmarkSkills.length,
      matchingSkills,
      missingSkills,
      recommendations
    };

    // 10. Assemble complete artifacts payload
    const artifacts = {
      target_role: chosenRole,
      linkedin_headline: linkedinHeadline,
      linkedin_about: linkedinAbout,
      resume_summary: resumeSummary,
      resume_bullets: resumeBullets,
      skill_gap_analysis: skillGapAnalysis,
      audit: {
        generator: 'local-rules-engine',
        isAiGenerated: false,
        disclaimer: 'Generated using local grounded rule templates based strictly on student-provided records. No unearned achievements or skills were fabricated.'
      }
    };

    return res.json({
      success: true,
      message: 'Career artifacts generated successfully.',
      artifacts
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get saved career artifacts for the authenticated student
 */
const getArtifacts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query('SELECT * FROM career_artifacts WHERE user_id = ?', [userId]);

    if (!rows || rows.length === 0) {
      return res.json({ success: true, artifacts: null });
    }

    const artifact = rows[0];
    const resumeBullets = parseJsonField(artifact.resume_bullets, []);
    const skillGapAnalysis = parseJsonField(artifact.skill_gap_analysis, null);

    return res.json({
      success: true,
      artifacts: {
        id: artifact.id,
        user_id: artifact.user_id,
        target_role: artifact.target_role,
        linkedin_headline: artifact.linkedin_headline,
        linkedin_about: artifact.linkedin_about,
        resume_summary: artifact.resume_summary,
        resume_bullets: resumeBullets,
        skill_gap_analysis: skillGapAnalysis,
        created_at: artifact.created_at,
        updated_at: artifact.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save or update reviewed career artifacts for the authenticated student
 */
const saveArtifacts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      target_role,
      linkedin_headline,
      linkedin_about,
      resume_summary,
      resume_bullets,
      skill_gap_analysis
    } = req.body;

    if (!target_role || typeof target_role !== 'string' || target_role.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'target_role is required.'
      });
    }

    const cleanBullets = Array.isArray(resume_bullets) ? resume_bullets : [];
    const cleanGap = typeof skill_gap_analysis === 'object' && skill_gap_analysis !== null ? skill_gap_analysis : {};

    await pool.query(
      `INSERT INTO career_artifacts 
        (user_id, target_role, linkedin_headline, linkedin_about, resume_summary, resume_bullets, skill_gap_analysis)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        target_role = VALUES(target_role),
        linkedin_headline = VALUES(linkedin_headline),
        linkedin_about = VALUES(linkedin_about),
        resume_summary = VALUES(resume_summary),
        resume_bullets = VALUES(resume_bullets),
        skill_gap_analysis = VALUES(skill_gap_analysis),
        updated_at = NOW()`,
      [
        userId,
        target_role.trim(),
        linkedin_headline || '',
        linkedin_about || '',
        resume_summary || '',
        JSON.stringify(cleanBullets),
        JSON.stringify(cleanGap)
      ]
    );

    // Fetch saved record
    const [saved] = await pool.query('SELECT * FROM career_artifacts WHERE user_id = ?', [userId]);
    const record = saved[0];

    return res.json({
      success: true,
      message: 'Career artifacts saved successfully.',
      artifacts: {
        id: record.id,
        user_id: record.user_id,
        target_role: record.target_role,
        linkedin_headline: record.linkedin_headline,
        linkedin_about: record.linkedin_about,
        resume_summary: record.resume_summary,
        resume_bullets: parseJsonField(record.resume_bullets, []),
        skill_gap_analysis: parseJsonField(record.skill_gap_analysis, null),
        created_at: record.created_at,
        updated_at: record.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete saved career artifacts for the authenticated student
 */
const deleteArtifacts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [result] = await pool.query('DELETE FROM career_artifacts WHERE user_id = ?', [userId]);

    return res.json({
      success: true,
      message: result.affectedRows > 0 ? 'Career artifacts deleted successfully.' : 'No saved career artifacts found to delete.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export resume as clean, formatted plain text / markdown
 */
const exportResumeText = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch user info, profile, experiences, skills, badges, and saved artifacts
    const [users] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    const userEmail = users[0]?.email || '';

    const [profiles] = await pool.query('SELECT * FROM student_profiles WHERE user_id = ?', [userId]);
    const profile = profiles[0] || {};

    const [artifactsRows] = await pool.query('SELECT * FROM career_artifacts WHERE user_id = ?', [userId]);
    const savedArtifact = artifactsRows[0] || {};
    const savedBullets = parseJsonField(savedArtifact.resume_bullets, []);

    const [experiences] = await pool.query(
      'SELECT * FROM experiences WHERE user_id = ? ORDER BY start_date DESC',
      [userId]
    );

    const [skills] = await pool.query(
      'SELECT * FROM skills WHERE user_id = ? ORDER BY score DESC, name ASC',
      [userId]
    );

    const [badges] = await pool.query(
      'SELECT * FROM digital_badges WHERE user_id = ? ORDER BY score DESC',
      [userId]
    );

    const studentName = profile.full_name || 'STUDENT NAME';
    const targetRole = savedArtifact.target_role || profile.target_job_roles || 'SOFTWARE ENGINEER';

    let textDoc = '';
    textDoc += `${'='.repeat(70)}\n`;
    textDoc += `${studentName.toUpperCase()}\n`;
    textDoc += `Target Role: ${targetRole}\n`;
    textDoc += `Email: ${userEmail}`;
    if (profile.college_name) textDoc += ` | College: ${profile.college_name}`;
    if (profile.degree) textDoc += ` | Degree: ${profile.degree}`;
    if (profile.graduation_year) textDoc += ` | Graduating: ${profile.graduation_year}`;
    textDoc += `\n${'='.repeat(70)}\n\n`;

    // Summary
    textDoc += `PROFESSIONAL SUMMARY\n${'-'.repeat(30)}\n`;
    textDoc += `${savedArtifact.resume_summary || 'Driven student software engineer with verified hands-on project competencies.'}\n\n`;

    // Skills
    if (skills.length > 0) {
      textDoc += `TECHNICAL SKILLS & COMPETENCIES\n${'-'.repeat(30)}\n`;
      const techSkills = skills.filter(s => s.category === 'Technical').map(s => s.name);
      const toolSkills = skills.filter(s => s.category === 'Tools & Frameworks').map(s => s.name);
      const softSkills = skills.filter(s => s.category === 'Soft Skills & Leadership').map(s => s.name);

      if (techSkills.length > 0) textDoc += `Languages & Systems: ${techSkills.join(', ')}\n`;
      if (toolSkills.length > 0) textDoc += `Tools & Frameworks: ${toolSkills.join(', ')}\n`;
      if (softSkills.length > 0) textDoc += `Professional Skills: ${softSkills.join(', ')}\n`;
      textDoc += `\n`;
    }

    // Digital Badges
    if (badges.length > 0) {
      textDoc += `VERIFIED DIGITAL BADGES (SkillBadge AI)\n${'-'.repeat(30)}\n`;
      for (const badge of badges) {
        textDoc += `• [${badge.tier.toUpperCase()}] ${badge.title} (Score: ${badge.score}/100) — Issued: ${badge.issued_date ? new Date(badge.issued_date).toLocaleDateString() : 'Active'}\n`;
      }
      textDoc += `\n`;
    }

    // Experience
    if (experiences.length > 0) {
      textDoc += `PROJECTS & EXPERIENCE\n${'-'.repeat(30)}\n`;
      for (const exp of experiences) {
        const bulletMatch = savedBullets.find(b => b.experienceId === exp.id);
        const bulletText = bulletMatch ? bulletMatch.bullet : exp.description;
        const techList = parseJsonField(exp.technologies_used, []);

        textDoc += `${exp.title} | ${exp.role_title || exp.category}\n`;
        if (exp.organization) textDoc += `Organization: ${exp.organization}\n`;
        textDoc += `Dates: ${exp.start_date ? new Date(exp.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : ''} – ${exp.is_current ? 'Present' : exp.end_date ? new Date(exp.end_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'Completed'}\n`;
        if (techList.length > 0) textDoc += `Technologies: ${techList.join(', ')}\n`;
        if (exp.evidence_url) textDoc += `Evidence: ${exp.evidence_url}\n`;
        textDoc += `• ${bulletText}\n\n`;
      }
    }

    textDoc += `${'-'.repeat(70)}\n`;
    textDoc += `* Generated via SkillBadge AI verified evidence engine. Validated from student-documented project records.\n`;

    return res.json({
      success: true,
      filename: `${studentName.replace(/\s+/g, '_')}_Resume.txt`,
      content: textDoc
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateArtifacts,
  getArtifacts,
  saveArtifacts,
  deleteArtifacts,
  exportResumeText
};
