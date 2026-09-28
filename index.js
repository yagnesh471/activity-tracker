require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const GITHUB_API_URL = 'https://api.github.com/graphql';
const LEETCODE_API_URL = 'https://leetcode.com/graphql';

async function fetchGithubData(username, token) {
  if (!username || !token) {
    console.error('Missing GitHub username or token');
    return {};
  }
  
  username = username.trim();
  token = token.trim();
  console.log(`Fetching GitHub data for user: "${username}"`);
  
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection(from: "2026-01-01T00:00:00Z", to: "2026-12-31T23:59:59Z") {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      GITHUB_API_URL,
      { query, variables: { username } },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      console.error('GitHub GraphQL Errors:', response.data.errors);
    }

    const user = response.data.data?.user;
    if (!user) {
      console.error('GitHub user not found or response is empty.');
      return {};
    }

    const weeks = user.contributionsCollection.contributionCalendar.weeks;
    const days = weeks.flatMap(week => week.contributionDays);
    
    // Convert to map of date string (YYYY-MM-DD) -> count
    const activityMap = {};
    let totalContributions = 0;
    days.forEach(day => {
      // day.date is in YYYY-MM-DD format
      activityMap[day.date] = day.contributionCount;
      totalContributions += day.contributionCount;
    });
    console.log(`Fetched GitHub data for ${username}: ${totalContributions} total contributions in 2026`);

    return activityMap;
  } catch (error) {
    console.error('Error fetching GitHub data:', error.response?.data || error.message);
    return {};
  }
}

async function fetchLeetcodeData(username) {
  if (!username) return {};

  const query = `
    query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        userCalendar(year: 2026) {
          submissionCalendar
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      LEETCODE_API_URL,
      { query, variables: { username } },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const matchedUser = response.data.data?.matchedUser;
    if (!matchedUser) return {};

    const submissionCalendar = JSON.parse(matchedUser.userCalendar.submissionCalendar);
    
    // Convert UNIX timestamps to YYYY-MM-DD
    const activityMap = {};
    for (const [timestamp, count] of Object.entries(submissionCalendar)) {
      const dateObj = new Date(parseInt(timestamp) * 1000);
      
      // Ensure we only process dates for 2026 (based on local or UTC time)
      if (dateObj.getFullYear() !== 2026) continue;

      const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
      activityMap[dateStr] = (activityMap[dateStr] || 0) + count;
    }

    return activityMap;
  } catch (error) {
    console.error(`Error fetching LeetCode data for ${username}:`, error.message);
    return {};
  }
}

function formatDateToMonthDay(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(month) - 1]} ${parseInt(day)}`;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/activity', async (req, res) => {
  try {
    require('dotenv').config({ override: true });
    const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const LEETCODE_USERNAME_1 = process.env.LEETCODE_USERNAME_1;
    const LEETCODE_USERNAME_2 = process.env.LEETCODE_USERNAME_2;

    const [githubActivity, leetcode1Activity, leetcode2Activity] = await Promise.all([
      fetchGithubData(GITHUB_USERNAME, GITHUB_TOKEN),
      fetchLeetcodeData(LEETCODE_USERNAME_1),
      fetchLeetcodeData(LEETCODE_USERNAME_2)
    ]);

    const combinedMap = {};

    // Helper to add data to combinedMap
    const addToMap = (sourceMap, type) => {
      for (const [dateStr, count] of Object.entries(sourceMap)) {
        if (!combinedMap[dateStr]) {
          combinedMap[dateStr] = { date: dateStr, github: 0, leetcode: 0 };
        }
        combinedMap[dateStr][type] += count;
      }
    };

    addToMap(githubActivity, 'github');
    addToMap(leetcode1Activity, 'leetcode');
    addToMap(leetcode2Activity, 'leetcode');

    // Convert map to array and sort by date
    const sortedDates = Object.keys(combinedMap).sort();
    
    const result = sortedDates.map(dateStr => {
      const data = combinedMap[dateStr];
      const total = data.github + data.leetcode;
      
      return {
        date: formatDateToMonthDay(dateStr),
        total: total,
        github: data.github,
        leetcode: data.leetcode
      };
    });

    res.json(result);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
