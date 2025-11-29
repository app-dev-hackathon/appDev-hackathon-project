import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { 
  Dumbbell, Moon, BookOpen, Droplets, Apple, Brain, 
  User, Lock, Mail, Home, Trophy, BarChart3, 
  Target, ChevronRight, Flame, TrendingUp, TrendingDown, Lightbulb,
  Medal, Users, Zap, Clock, Code, AlertCircle, Plus, LogIn, UserPlus
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// --- 1. API Client ---
// A mock API client for the self-contained app demonstration.
// In a real project, this would use Axios and the base URL would be passed via an environment variable.

const API_BASE_URL = window.location.origin.includes('localhost') 
  ? 'http://localhost:8000' // Local dev
  : window.location.origin; // Same origin for production-like

const getToken = () => localStorage.getItem('token');

const request = async (method, path, body = null) => {
  const url = `${API_BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const options = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    };
    
    // Simple exponential backoff retry mechanism
    let response;
    let error;
    for (let i = 0; i < 3; i++) {
        response = await fetch(url, options);
        if (response.ok) {
            break;
        }
        error = response.status;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `API Request Failed with status ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {};
    }

    return await response.json();
    
  } catch (error) {
    console.error(`Request to ${path} failed:`, error.message);
    throw error;
  }
};

const api = {
  auth: {
    login: (credentials) => request('POST', '/auth/login', credentials),
    register: (data) => request('POST', '/auth/signup', data),
    getMe: () => request('GET', '/auth/me'),
  },
  habits: {
    log: (entry) => request('POST', '/habits/log', entry),
    getToday: () => request('GET', '/habits/today'),
    getWeek: () => request('GET', '/habits/week'),
    getHistory: (days) => request('GET', `/habits/history/${days}`),
  },
  league: {
    create: (data) => request('POST', '/league/create', data),
    join: (data) => request('POST', '/league/join', data),
    getStandings: () => request('GET', '/league/standings'),
  },
  matchups: {
    getCurrent: () => request('GET', '/matchup/current'),
  },
  insights: {
    getSummary: () => request('GET', '/insights/summary'),
    getDailyTip: () => request('GET', '/insights/coach-tip'),
    updateGoals: (goals) => request('PUT', '/user/goals', { goals }),
  }
};

// --- 2. Auth Context ---

const AuthContext = createContext(null);

function useAuthProvider() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.auth.getMe();
      setUser(response);
    } catch (err) {
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [fetchUser]);

  const login = async (email, password) => {
    try {
      setError(null);
      const response = await api.auth.login({ email, password });
      localStorage.setItem('token', response.access_token);
      await fetchUser();
      return true;
    } catch (err) {
      setError(err.message || 'Login failed');
      return false;
    }
  };

  const register = async (name, email, password) => {
    try {
      setError(null);
      const response = await api.auth.register({ name, email, password });
      localStorage.setItem('token', response.access_token);
      await fetchUser();
      return true;
    } catch (err) {
      setError(err.message || 'Registration failed');
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const authContextValue = useMemo(() => ({
    user,
    loading,
    error,
    login,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!user,
  }), [user, loading, error]);

  return authContextValue;
}

function AuthProvider({ children }) {
  const auth = useAuthProvider();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// --- 3. UI Components ---

const theme = {
    '--bg-darkest': '#0a0a0a',
    '--bg-dark': '#111827',
    '--bg-card': '#1f2937',
    '--bg-elevated': '#374151',
    '--text-primary': '#f3f4f6',
    '--text-secondary': '#9ca3af',
    '--neon-cyan': '#00fff0',
    '--neon-pink': '#ff00aa',
    '--neon-green': '#00ff7f',
    '--neon-yellow': '#fffb00',
    '--gradient-primary': 'linear-gradient(45deg, var(--neon-cyan), var(--neon-pink))',
    '--radius-lg': '12px',
    '--radius-xl': '16px',
    '--space-md': '1rem',
    '--space-lg': '1.5rem',
    '--space-xl': '2.5rem',
    '--font-display': '"Inter", sans-serif',
    '--font-body': '"Inter", sans-serif',
};

function Spinner() {
  return (
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-neon-cyan"></div>
  );
}

function ErrorMessage({ message }) {
  return (
    <div className="p-3 bg-red-900/40 border border-neon-pink text-neon-pink rounded-lg text-sm mb-4">
      <AlertCircle className="inline w-4 h-4 mr-2" />
      {message}
    </div>
  );
}

function InputWithIcon({ Icon, ...props }) {
    return (
        <div className="relative flex items-center">
            <Icon className="absolute left-3 w-5 h-5 text-gray-400 group-focus-within:text-neon-cyan transition-colors duration-200" />
            <input
                {...props}
                className="w-full p-3 pl-10 bg-bg-elevated border border-bg-elevated rounded-lg text-text-primary focus:ring-2 focus:ring-neon-cyan focus:border-neon-cyan transition-all duration-200 shadow-lg"
            />
        </div>
    );
}

function Button({ children, className = '', variant = 'primary', loading = false, ...props }) {
    const baseStyle = "px-6 py-3 font-semibold rounded-lg shadow-lg transition-all duration-300 flex items-center justify-center gap-2";
    let variantStyle;

    switch (variant) {
        case 'secondary':
            variantStyle = 'bg-bg-elevated text-text-primary hover:bg-bg-card border border-neon-cyan/30';
            break;
        case 'danger':
            variantStyle = 'bg-red-600 text-white hover:bg-red-700';
            break;
        default:
            variantStyle = 'bg-neon-cyan text-bg-darkest hover:bg-neon-cyan/80 shadow-neon-cyan/40 shadow-xl';
    }

    return (
        <button
            className={`${baseStyle} ${variantStyle} ${className} ${loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.98]'}`}
            disabled={loading || props.disabled}
            {...props}
        >
            {loading ? <Spinner /> : children}
        </button>
    );
}

function Card({ children, title, icon: Icon, className = '' }) {
    return (
        <div className={`bg-bg-card border border-neon-cyan/10 rounded-xl p-6 shadow-2xl ${className}`}>
            {title && (
                <div className="flex items-center mb-4 border-b border-neon-cyan/10 pb-3">
                    {Icon && <Icon className="w-6 h-6 mr-2 text-neon-cyan" />}
                    <h2 className="text-xl font-bold text-text-primary">{title}</h2>
                </div>
            )}
            {children}
        </div>
    );
}

function Navbar() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = isAuthenticated
    ? [
        { name: 'Dashboard', path: '/dashboard', icon: Home },
        { name: 'League', path: '/league', icon: Trophy },
        { name: 'Insights', path: '/insights', icon: BarChart3 },
      ]
    : [];

  return (
    <nav className="bg-bg-dark border-b border-neon-cyan/20 sticky top-0 z-10 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-2">
          <Zap className="w-8 h-8 text-neon-cyan filter drop-shadow-[0_0_8px_rgba(0,255,240,0.6)]" />
          <span className="text-2xl font-bold text-text-primary hidden sm:block">Fantasy Life League</span>
        </Link>
        
        <div className="flex items-center space-x-4">
          {navItems.map((item) => (
            <Link 
              key={item.name} 
              to={item.path} 
              className="text-text-secondary hover:text-neon-cyan transition-colors duration-200 flex items-center gap-1 text-sm font-medium p-2 rounded-lg"
            >
              <item.icon className="w-5 h-5" />
              <span className='hidden sm:inline'>{item.name}</span>
            </Link>
          ))}
          
          {isAuthenticated ? (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-neon-green hidden sm:block">
                Welcome, {user?.name || 'Player'}!
              </span>
              <Button onClick={handleLogout} variant="secondary" className="text-sm px-4 py-2">
                Log Out
              </Button>
            </div>
          ) : (
            <>
              <Link to="/login">
                <Button variant="secondary" className="text-sm px-4 py-2">
                  <LogIn className="w-4 h-4" />
                  Log In
                </Button>
              </Link>
              <Link to="/signup">
                <Button variant="primary" className="text-sm px-4 py-2 hidden sm:flex">
                  <UserPlus className="w-4 h-4" />
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function LeagueTable({ standings, currentUserId }) {
    if (!standings || standings.length === 0) {
        return (
            <div className="bg-bg-card border border-neon-cyan/10 rounded-xl p-8 text-center text-text-secondary">
                <p>No standings available. Be the first to join a league!</p>
            </div>
        );
    }

    const getRankIcon = (rank) => {
        switch (rank) {
            case 1:
                return <Trophy size={18} className="text-yellow-400 filter drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]" />;
            case 2:
                return <Medal size={18} className="text-gray-300 filter drop-shadow-[0_0_8px_rgba(209,213,219,0.8)]" />;
            case 3:
                return <Medal size={18} className="text-amber-700 filter drop-shadow-[0_0_8px_rgba(180,83,9,0.8)]" />;
            default:
                return <span className="font-mono text-text-secondary w-5 text-center">{rank}</span>;
        }
    };

    return (
        <Card title="League Standings" icon={Users}>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neon-cyan/10">
                    <thead className="bg-bg-elevated/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neon-cyan">Rank</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neon-cyan">Player</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neon-cyan">W</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neon-cyan">L</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neon-cyan">Total Pts</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neon-cyan">Current Week</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neon-cyan/5">
                        {standings.map((player) => (
                            <tr
                                key={player.player_id}
                                className={`transition-colors duration-200 ${player.player_id === currentUserId ? 'bg-neon-cyan/5 border-l-4 border-neon-cyan' : 'hover:bg-bg-elevated/30'}`}
                            >
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium flex items-center justify-start h-full">
                                    {getRankIcon(player.rank)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center gap-2">
                                        <span className="text-text-primary">{player.name}</span>
                                        {player.player_id === currentUserId && (
                                            <span className="text-xs font-bold bg-neon-cyan text-bg-darkest px-2 py-0.5 rounded-full shadow-md">YOU</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-neon-green font-bold">{player.wins}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-neon-pink font-bold">{player.losses}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-text-primary font-mono">{player.total_points.toFixed(1)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                    <div className='flex items-center justify-center gap-1 font-mono text-neon-cyan'>
                                        {player.current_week_score?.total?.toFixed(1) || '0.0'}
                                        {player.current_week_score?.total > 0 && <TrendingUp size={14} />}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}


function HabitLogForm({ onSubmit, initialData = {} }) {
    const { user } = useAuth();
    const [formData, setFormData] = useState(initialData);
    const [loading, setLoading] = useState(false);
    const [coachTip, setCoachTip] = useState(null);
    const [error, setError] = useState(null);

    // Sync user goals to initial form data (e.g. for placeholders)
    useEffect(() => {
        if (user?.goals) {
            setFormData(prev => ({ 
                ...prev, 
                sleep: prev.sleep ?? null,
                study: prev.study ?? null,
                exercise: prev.exercise ?? null,
                hydration: prev.hydration ?? null,
                nutrition: prev.nutrition ?? null,
                mindfulness: prev.mindfulness ?? null,
            }));
        }
    }, [user]);
    
    // Set initial data when provided (e.g., today's existing log)
    useEffect(() => {
        if (Object.keys(initialData).length > 0) {
            setFormData(initialData);
        }
    }, [initialData]);

    const habitFields = [
        { key: 'sleep', label: 'Sleep (Hours)', Icon: Moon, type: 'number', placeholder: user?.goals?.sleep ?? 8.0 },
        { key: 'study', label: 'Study (Hours)', Icon: BookOpen, type: 'number', placeholder: user?.goals?.study ?? 2.0 },
        { key: 'exercise', label: 'Exercise (Hours)', Icon: Dumbbell, type: 'number', placeholder: user?.goals?.exercise ?? 1.0 },
        { key: 'hydration', label: 'Hydration (Cups)', Icon: Droplets, type: 'number', placeholder: user?.goals?.hydration ?? 8 },
        { key: 'nutrition', label: 'Healthy Meal (1=Yes, 0=No)', Icon: Apple, type: 'number', placeholder: 1, min: 0, max: 1 },
        { key: 'mindfulness', label: 'Mindfulness (Mins)', Icon: Brain, type: 'number', placeholder: 15 },
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Convert to number, or null if empty
        const numericValue = value === '' ? null : parseFloat(value);
        setFormData({ ...formData, [name]: numericValue });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setCoachTip(null);

        // Filter out null or non-positive values to only send logged habits
        const cleanedData = Object.fromEntries(
            Object.entries(formData).filter(([_, v]) => v !== null && v > 0)
        );

        try {
            await api.habits.log(cleanedData);
            
            // --- EDUCATE: Fetch Coach Tip after successful log ---
            const tipRes = await api.insights.getDailyTip();
            setCoachTip(tipRes);
            
            if (onSubmit) {
                await onSubmit(); // Refresh dashboard data
            }

        } catch (err) {
            setError(err.message || 'Failed to log habits.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card title="Daily Habit Log" icon={Clock} className="col-span-1 lg:col-span-1">
            <p className='text-sm text-text-secondary mb-4'>Enter your habit data for today (only positive values will be logged and scored).</p>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    {habitFields.map(({ key, label, Icon, type, placeholder, min, max }) => (
                        <div key={key} className="flex flex-col space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wider text-neon-cyan/80 flex items-center gap-1">
                                <Icon className="w-4 h-4" />
                                {label}
                            </label>
                            <input
                                type={type}
                                name={key}
                                value={formData[key] === null ? '' : formData[key]}
                                onChange={handleChange}
                                placeholder={`Goal: ${placeholder}`}
                                min={min}
                                max={max}
                                step="0.1"
                                className="w-full p-2 bg-bg-elevated border border-bg-elevated rounded-lg text-text-primary focus:ring-1 focus:ring-neon-pink focus:border-neon-pink transition-all duration-200 text-sm"
                            />
                        </div>
                    ))}
                </div>

                {error && <ErrorMessage message={error} />}

                <Button type="submit" loading={loading} className="w-full mt-4">
                    Log Habits & Get Points
                </Button>
            </form>
            
            {coachTip && (
                <div className={`mt-6 p-4 rounded-lg border shadow-lg transition-opacity duration-500 ${
                    coachTip.category === 'sleep' ? 'bg-indigo-900/40 border-indigo-600' : 
                    coachTip.category === 'general' ? 'bg-gray-700/40 border-gray-500' : 
                    'bg-green-900/40 border-green-600'
                }`}>
                    <div className="flex items-center text-sm font-semibold mb-1">
                        <Lightbulb className="w-5 h-5 mr-2 text-neon-yellow" />
                        <span className="uppercase tracking-widest text-neon-yellow">Coach Tip: {coachTip.category.toUpperCase()}</span>
                    </div>
                    <p className="text-text-primary italic text-sm">{coachTip.tip}</p>
                </div>
            )}
        </Card>
    );
}

function MatchupCard({ matchup, userId, isDetailed = false }) {
    if (!matchup || !matchup.matchup_exists) {
        return (
            <Card title="Weekly Matchup" icon={Trophy} className="flex flex-col justify-center items-center text-center">
                <p className="text-text-secondary">Waiting for 9 more players to start the league.</p>
                <Link to="/league" className="mt-4 text-neon-cyan hover:underline flex items-center">
                    Go to League Page <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
            </Card>
        );
    }

    const userScore = matchup.user.score.total;
    const oppScore = matchup.opponent.score.total;
    const isLeading = userScore > oppScore;

    const UserIcon = isLeading ? Flame : TrendingDown;
    const OpponentIcon = isLeading ? TrendingDown : Flame;
    
    const UserStyle = isLeading ? "text-neon-green" : "text-neon-pink";
    const OppStyle = isLeading ? "text-neon-pink" : "text-neon-green";

    return (
        <Card title={isDetailed ? "Detailed Matchup Analysis" : "Weekly Matchup"} icon={Trophy}>
            <div className="text-center mb-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Week {matchup.week}</span>
            </div>
            
            {/* Scoreboard */}
            <div className="flex items-center justify-between text-center bg-bg-elevated p-4 rounded-lg border border-neon-cyan/20">
                <div className="flex flex-col items-center w-1/3">
                    <span className="text-sm text-text-secondary">{matchup.user.name}</span>
                    <span className={`text-4xl font-extrabold ${UserStyle} font-mono mt-1`}>{userScore.toFixed(1)}</span>
                    <UserIcon className={`w-5 h-5 mt-1 ${UserStyle}`} />
                </div>
                <span className="text-xl font-bold text-text-secondary">VS</span>
                <div className="flex flex-col items-center w-1/3">
                    <span className="text-sm text-text-secondary">{matchup.opponent.name}</span>
                    <span className={`text-4xl font-extrabold ${OppStyle} font-mono mt-1`}>{oppScore.toFixed(1)}</span>
                    <OpponentIcon className={`w-5 h-5 mt-1 ${OppStyle}`} />
                </div>
            </div>

            {/* Matchup Recap (EDUCATE) */}
            <div className={`mt-6 p-4 rounded-lg ${isLeading ? 'bg-green-900/40 border-neon-green/50' : 'bg-red-900/40 border-neon-pink/50'} border`}>
                <h3 className='text-lg font-bold mb-2 text-text-primary'>Matchup Recap</h3>
                <p className='text-sm text-text-secondary italic'>
                    {matchup.recap.message}
                </p>
                <div className='mt-2 text-xs font-mono text-text-primary/70'>
                    Projected Final: <span className={UserStyle}>{matchup.recap.user_projection.toFixed(1)}</span> - <span className={OppStyle}>{matchup.recap.opponent_projection.toFixed(1)}</span>
                </div>
            </div>

            {isDetailed && (
                <div className='mt-6 space-y-3'>
                    <h3 className='text-xl font-bold text-text-primary border-b border-neon-cyan/20 pb-2'>Category Breakdown</h3>
                    {Object.entries(matchup.comparison).map(([cat, scores]) => (
                        <div key={cat} className='p-3 bg-bg-elevated/50 rounded-lg'>
                            <p className='text-sm font-semibold text-text-secondary capitalize mb-1'>{cat}</p>
                            <div className='flex items-center space-x-2 text-sm font-mono'>
                                <span className={`w-1/3 text-left ${scores.leading === 'user' ? 'text-neon-green font-bold' : 'text-text-primary'}`}>{scores.user} Pts</span>
                                <div className='flex-grow h-2 bg-gray-700 rounded-full'>
                                    <div 
                                        className={`h-full rounded-full ${scores.leading === 'user' ? 'bg-neon-green' : 'bg-neon-pink'}`} 
                                        style={{ width: `${Math.min((scores.user / (scores.user + scores.opponent)) * 100, 100)}%` }}
                                    ></div>
                                </div>
                                <span className={`w-1/3 text-right ${scores.leading === 'opponent' ? 'text-neon-green font-bold' : 'text-text-primary'}`}>{scores.opponent} Pts</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {!isDetailed && (
                <Link to="/matchup" className="mt-4 block text-center text-neon-cyan hover:text-neon-pink transition-colors">
                    View Detailed Analysis <ChevronRight className="w-4 h-4 ml-1 inline" />
                </Link>
            )}
        </Card>
    );
}

// --- 4. Pages ---

function Landing() {
  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-8 bg-bg-darkest">
      <div className="max-w-4xl text-center">
        <h1 className="text-6xl font-extrabold text-text-primary mb-4 leading-tight">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-neon-cyan to-neon-pink">
            Fantasy Life League
          </span>
        </h1>
        <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto">
          Compete with friends to make healthy choices. Track your sleep, study, and exercise habits, score points, and win your weekly matchups!
        </p>
        
        <div className="flex justify-center space-x-4 mb-12">
          <Link to="/signup">
            <Button variant="primary" className="text-lg py-3 px-8">
              Start Your League <Zap className="w-5 h-5" />
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" className="text-lg py-3 px-8">
              Log In
            </Button>
          </Link>
        </div>

        {/* Feature Highlights */}
        <div className="grid md:grid-cols-3 gap-8 text-left mt-12">
            <div className="p-6 bg-bg-card rounded-xl border border-neon-cyan/10 shadow-lg">
                <Trophy className="w-8 h-8 text-neon-cyan mb-3" />
                <h3 className="text-xl font-semibold text-text-primary mb-2">Reward: Social Competition</h3>
                <p className="text-text-secondary text-sm">Win weekly matchups against your friends based on your accumulated health points and climb the league table.</p>
            </div>
            <div className="p-6 bg-bg-card rounded-xl border border-neon-pink/10 shadow-lg">
                <BarChart3 className="w-8 h-8 text-neon-pink mb-3" />
                <h3 className="text-xl font-semibold text-text-primary mb-2">Track: Effortless Logging</h3>
                <p className="text-text-secondary text-sm">Simple, low-friction forms to log your sleep, study, and activity, automatically generating points and streaks.</p>
            </div>
            <div className="p-6 bg-bg-card rounded-xl border border-neon-green/10 shadow-lg">
                <Lightbulb className="w-8 h-8 text-neon-green mb-3" />
                <h3 className="text-xl font-semibold text-text-primary mb-2">Educate: Contextual Tips</h3>
                <p className="text-text-secondary text-sm">Receive immediate, actionable coach tips after logging habits and detailed matchup analysis for continuous learning.</p>
            </div>
        </div>
      </div>
    </div>
  );
}

function AuthPage({ type }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, error, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const isLogin = type === 'login';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    let success = false;
    if (isLogin) {
      success = await login(email, password);
    } else {
      success = await register(name, email, password);
    }

    setLoading(false);

    if (success) {
      navigate('/dashboard');
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-8 bg-bg-darkest">
      <div className="w-full max-w-md bg-bg-card border border-neon-cyan/10 rounded-xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neon-cyan to-neon-pink"></div>
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gradient-to-br from-neon-cyan to-neon-pink rounded-xl text-bg-darkest shadow-xl">
            {isLogin ? <LogIn className='w-8 h-8' /> : <UserPlus className='w-8 h-8' />}
          </div>
          <h1 className="text-3xl font-bold text-text-primary">{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="text-sm text-text-secondary mt-1">Start your journey to better habits today.</p>
        </div>
        
        {error && <ErrorMessage message={error} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-neon-cyan/80 mb-1 block">Name</label>
              <InputWithIcon
                Icon={User}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                required={!isLogin}
              />
            </div>
          )}
          
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neon-cyan/80 mb-1 block">Email</label>
            <InputWithIcon
              Icon={Mail}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neon-cyan/80 mb-1 block">Password</label>
            <InputWithIcon
              Icon={Lock}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" loading={loading} className="w-full mt-6">
            {isLogin ? 'Sign In' : 'Sign Up'}
          </Button>
        </form>

        <p className="text-center text-sm text-text-secondary mt-6">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
          <Link to={isLogin ? "/signup" : "/login"} className="text-neon-cyan hover:text-neon-pink font-semibold transition-colors">
            {isLogin ? "Sign Up" : "Log In"}
          </Link>
        </p>
      </div>
    </div>
  );
}

function Login() { return <AuthPage type="login" />; }
function Signup() { return <AuthPage type="signup" />; }

function Dashboard() {
    const { user, refreshUser } = useAuth();
    const [matchup, setMatchup] = useState(null);
    const [todayData, setTodayData] = useState(null);
    const [weekData, setWeekData] = useState(null);
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [todayRes, weekRes, insightsRes, dailyTipRes] = await Promise.all([
                api.habits.getToday().catch(() => ({})), // Catch 404 if no log
                api.habits.getWeek(),
                api.insights.getSummary(),
                api.insights.getDailyTip(),
            ]);

            setTodayData(todayRes);
            setWeekData(weekRes.score);
            setInsights(insightsRes);
            
            // Set the daily tip as a temporary state on the dashboard for display
            if (dailyTipRes) {
                 setTodayData(prev => ({ 
                    ...prev, 
                    coachTip: dailyTipRes 
                }));
            }

            if (user?.league_id) {
                const matchupRes = await api.matchups.getCurrent();
                setMatchup(matchupRes);
            }

        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    }, [user?.league_id]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user, fetchData]);
    
    // Function passed to HabitLogForm to refresh data after submission
    const handleLogSubmit = async () => {
        // Fetch new data to update all dashboard panels
        await fetchData();
    };

    const categoryIcons = {
        sleep: Moon,
        study: BookOpen,
        exercise: Dumbbell,
        hydration: Droplets,
        nutrition: Apple,
        mindfulness: Brain,
    };

    if (loading) {
        return (
            <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
                <Spinner />
            </div>
        );
    }
    
    const todayPoints = todayData?.total_points || 0;
    const todayTip = todayData?.coachTip;
    
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-text-primary mb-6 flex items-center gap-2">
                <Home className="w-7 h-7 text-neon-cyan" />
                Welcome back, {user?.name || 'Player'}!
            </h1>
            
            {/* Main Grid: Habit Log & Matchup/Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* COLUMN 1: Habit Log Form */}
                <HabitLogForm onSubmit={handleLogSubmit} initialData={todayData?.entry || {}} />

                {/* COLUMN 2 & 3: Matchup, Daily Summary, Streaks */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Row 1: Matchup Card */}
                    <MatchupCard matchup={matchup} userId={user?._id} />

                    {/* Row 2: Daily & Weekly Summary (TRACK) */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        
                        {/* Daily Summary */}
                        <Card title="Today's Score" icon={Zap}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-4xl font-extrabold text-neon-cyan font-mono">{todayPoints.toFixed(1)} <span className='text-xl text-text-secondary'>Pts</span></p>
                                    <p className="text-sm text-text-secondary mt-1">Total points earned today.</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-text-primary text-xl font-semibold">Streak</p>
                                    <p className="text-4xl font-extrabold text-neon-green font-mono flex items-center gap-1 mt-1">
                                        {insights?.streak || 0} <Flame className='w-6 h-6' />
                                    </p>
                                </div>
                            </div>
                            
                            {todayTip && (
                                <div className={`mt-4 p-3 rounded-lg border text-sm ${
                                    todayTip.category === 'sleep' ? 'bg-indigo-900/40 border-indigo-600' : 
                                    todayTip.category === 'general' ? 'bg-gray-700/40 border-gray-500' : 
                                    'bg-green-900/40 border-green-600'
                                }`}>
                                    <p className="text-text-primary italic">
                                        <Lightbulb className="w-4 h-4 inline mr-1 text-neon-yellow" />
                                        {todayTip.tip}
                                    </p>
                                </div>
                            )}
                        </Card>
                        
                        {/* Weekly Breakdown */}
                        <Card title="Week Overview" icon={TrendingUp}>
                            <div className="flex justify-between items-center mb-4 border-b border-neon-cyan/10 pb-3">
                                <div>
                                    <p className="text-sm text-text-secondary">Days Logged</p>
                                    <p className="text-2xl font-bold text-neon-cyan">{weekData?.days_logged || 0}/7</p>
                                </div>
                                <div>
                                    <p className="text-sm text-text-secondary">Total Points</p>
                                    <p className="text-2xl font-bold text-neon-pink">{weekData?.total?.toFixed(1) || '0.0'}</p>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                {weekData?.categories && Object.entries(weekData.categories)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([cat, pts]) => {
                                        const Icon = categoryIcons[cat];
                                        // Base the percentage on max possible points (7 days * 10 pts/day = 70)
                                        const width = Math.min((pts / 70) * 100, 100);
                                        return (
                                            <div key={cat} className="flex items-center gap-2">
                                                <div className="w-16 text-xs text-text-secondary flex items-center capitalize">
                                                    {Icon && <Icon className="w-4 h-4 mr-1 text-neon-cyan/80" />}
                                                    {cat}
                                                </div>
                                                <div className="flex-grow h-2 bg-bg-elevated rounded-full">
                                                    <div 
                                                        className="h-full rounded-full bg-neon-green transition-all duration-500"
                                                        style={{ width: `${width}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-mono text-text-primary">{pts.toFixed(1)}</span>
                                            </div>
                                        );
                                    })}
                            </div>
                        </Card>
                    </div>

                </div>
            </div>
        </div>
    );
}

function League() {
    const { user, refreshUser } = useAuth();
    const [league, setLeague] = useState(null);
    const [standings, setStandings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [formLoading, setFormLoading] = useState(false);
    const [error, setError] = useState(null);
    const [leagueName, setLeagueName] = useState('');
    const [joinCode, setJoinCode] = useState('');

    const fetchLeagueData = useCallback(async () => {
        if (!user?.league_id) {
            setLoading(false);
            return;
        }
        
        try {
            const result = await api.league.getStandings();
            setLeague(result.league);
            setStandings(result.standings);
        } catch (err) {
            console.error('Failed to fetch league data:', err);
            // If league is not found (404), maybe user's league_id is stale
            if (err.message.includes('404')) {
                 await refreshUser(); // Try to clear stale league_id
            }
        } finally {
            setLoading(false);
        }
    }, [user, refreshUser]);

    useEffect(() => {
        fetchLeagueData();
    }, [fetchLeagueData]);

    const handleCreateLeague = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        setError(null);
        try {
            await api.league.create({ name: leagueName });
            await refreshUser();
            setLeagueName('');
        } catch (err) {
            setError(err.message || 'Failed to create league.');
        } finally {
            setFormLoading(false);
        }
    };

    const handleJoinLeague = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        setError(null);
        try {
            await api.league.join({ code: joinCode });
            await refreshUser();
            setJoinCode('');
        } catch (err) {
            setError(err.message || 'Failed to join league. Check the code.');
        } finally {
            setFormLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
                <Spinner />
            </div>
        );
    }
    
    if (!user?.league_id || !league) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-12">
                <h1 className="text-3xl font-bold text-text-primary mb-8 text-center">Join the League</h1>
                
                {error && <ErrorMessage message={error} />}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Create League */}
                    <Card title="Create New League" icon={Plus}>
                        <p className="text-text-secondary mb-4 text-sm">Be the commissioner! Invite up to 9 friends to compete with you.</p>
                        <form onSubmit={handleCreateLeague} className="space-y-4">
                            <input
                                type="text"
                                value={leagueName}
                                onChange={(e) => setLeagueName(e.target.value)}
                                placeholder="League Name (e.g., The Habit Heroes)"
                                required
                                className="w-full p-3 bg-bg-elevated border border-bg-elevated rounded-lg text-text-primary focus:ring-1 focus:ring-neon-cyan"
                            />
                            <Button type="submit" loading={formLoading} className="w-full">
                                Create League
                            </Button>
                        </form>
                    </Card>

                    {/* Join League */}
                    <Card title="Join Via Invite Code" icon={LogIn}>
                        <p className="text-text-secondary mb-4 text-sm">Enter the 6-character code your friend shared to join their competition.</p>
                        <form onSubmit={handleJoinLeague} className="space-y-4">
                            <input
                                type="text"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="INVITE CODE"
                                maxLength={6}
                                required
                                className="w-full p-3 bg-bg-elevated border border-bg-elevated rounded-lg text-text-primary text-center font-mono text-lg tracking-widest focus:ring-1 focus:ring-neon-cyan"
                            />
                            <Button type="submit" loading={formLoading} className="w-full" variant='secondary'>
                                Join League
                            </Button>
                        </form>
                    </Card>
                </div>
            </div>
        );
    }

    // User is in a league
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-start mb-6 border-b border-neon-cyan/20 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
                        <Trophy className="w-8 h-8 text-yellow-400 filter drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" />
                        {league.name}
                    </h1>
                    <p className="text-text-secondary text-lg mt-1">Season Standings & Weekly Results</p>
                </div>
                <div className="text-right space-y-1">
                    <div className='flex items-center gap-2 text-text-primary text-sm'>
                        <Users className='w-4 h-4 text-neon-cyan' />
                        <span className='font-semibold'>{standings?.length || 1}/10 Members</span>
                    </div>
                    <div className='flex items-center gap-2 text-text-primary text-sm'>
                        <Code className='w-4 h-4 text-neon-cyan' />
                        <span className='font-semibold font-mono text-neon-green'>{league.code}</span>
                    </div>
                    <p className='text-xs text-text-secondary'>Share this code to invite friends!</p>
                </div>
            </div>

            {/* Standings Table (REWARD) */}
            <LeagueTable standings={standings} currentUserId={user?._id} />

            {/* Mock Schedule/Badges Section (REWARD) */}
            <div className='mt-8 space-y-6'>
                <h2 className='text-2xl font-bold text-text-primary border-b border-neon-cyan/10 pb-2 flex items-center gap-2'>
                    <Medal className='w-6 h-6 text-neon-pink' /> Season Awards & Badges
                </h2>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                    <div className='p-4 bg-bg-card border border-neon-pink/10 rounded-lg text-center'>
                        <Flame className='w-8 h-8 text-neon-pink mx-auto mb-2' />
                        <p className='text-sm font-semibold text-text-primary'>Hydration Hero</p>
                        <p className='text-xs text-text-secondary'>Awarded for 3+ week hydration streak</p>
                    </div>
                    <div className='p-4 bg-bg-card border border-neon-pink/10 rounded-lg text-center'>
                        <Moon className='w-8 h-8 text-indigo-400 mx-auto mb-2' />
                        <p className='text-sm font-semibold text-text-primary'>Sleep MVP</p>
                        <p className='text-xs text-text-secondary'>Awarded for highest avg sleep score</p>
                    </div>
                    <div className='p-4 bg-bg-card border border-neon-pink/10 rounded-lg text-center'>
                        <TrendingUp className='w-8 h-8 text-neon-green mx-auto mb-2' />
                        <p className='text-sm font-semibold text-text-primary'>Comeback Kid</p>
                        <p className='text-xs text-text-secondary'>Awarded for largest weekly score improvement</p>
                    </div>
                    <div className='p-4 bg-bg-card border border-neon-pink/10 rounded-lg text-center'>
                        <BookOpen className='w-8 h-8 text-yellow-500 mx-auto mb-2' />
                        <p className='text-sm font-semibold text-text-primary'>Focus Titan</p>
                        <p className='text-xs text-text-secondary'>Awarded for highest total study hours</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Matchup() {
    const { user } = useAuth();
    const [matchup, setMatchup] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchMatchup = useCallback(async () => {
        if (!user?.league_id) {
            setLoading(false);
            return;
        }
        try {
            const result = await api.matchups.getCurrent();
            setMatchup(result);
        } catch (error) {
            console.error('Failed to fetch matchup:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchMatchup();
    }, [fetchMatchup]);

    if (loading) {
        return (
            <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
                <Spinner />
            </div>
        );
    }
    
    if (!matchup || !matchup.matchup_exists) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-12 text-center text-text-secondary">
                <Trophy className="w-12 h-12 mx-auto mb-4 text-neon-cyan" />
                <h1 className="text-2xl font-bold text-text-primary">No Active Matchup</h1>
                <p>You are either not in a league, or your league is in setup mode.</p>
                <Link to="/league" className="mt-4 text-neon-cyan hover:underline">Go to League Page</Link>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-text-primary mb-6 flex items-center gap-2">
                <Trophy className="w-7 h-7 text-yellow-400" />
                Week {matchup.week} Matchup
            </h1>
            
            <MatchupCard matchup={matchup} userId={user?._id} isDetailed={true} />
        </div>
    );
}

function Insights() {
    const { user, refreshUser } = useAuth();
    const [insights, setInsights] = useState(null);
    const [history, setHistory] = useState([]);
    const [goals, setGoals] = useState({});
    const [loading, setLoading] = useState(true);
    const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
    const [goalsForm, setGoalsForm] = useState({});
    const [goalsLoading, setGoalsLoading] = useState(false);
    const [goalsError, setGoalsError] = useState(null);
    
    const categoryIcons = {
        sleep: Moon,
        study: BookOpen,
        exercise: Dumbbell,
        hydration: Droplets,
        nutrition: Apple,
        mindfulness: Brain,
    };

    const fetchInsights = useCallback(async () => {
        try {
            const [insightsRes, historyRes] = await Promise.all([
                api.insights.getSummary(),
                api.habits.getHistory(30),
            ]);
            setInsights(insightsRes);
            setHistory(historyRes);
            setGoals(insightsRes.goals);
            setGoalsForm(insightsRes.goals); // Initialize form with current goals
        } catch (error) {
            console.error('Failed to fetch insights:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInsights();
    }, [fetchInsights]);
    
    // Goals Modal Handlers
    const handleGoalChange = (e) => {
        const { name, value } = e.target;
        setGoalsForm(prev => ({ ...prev, [name]: parseFloat(value) }));
    };

    const handleGoalSubmit = async (e) => {
        e.preventDefault();
        setGoalsLoading(true);
        setGoalsError(null);
        try {
            await api.insights.updateGoals(goalsForm);
            setIsGoalsModalOpen(false);
            await refreshUser(); // Update user context with new goals
            await fetchInsights(); // Refresh insights page data
        } catch (err) {
            setGoalsError(err.message || 'Failed to update goals.');
        } finally {
            setGoalsLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
                <Spinner />
            </div>
        );
    }
    
    const totalPointsGoal = Object.values(goals).reduce((sum, goal) => sum + Math.min(goal, 10), 0);
    const maxScore = totalPointsGoal || 50; // Default max to 50 if goals are not set

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-6 border-b border-neon-cyan/20 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
                        <BarChart3 className="w-7 h-7 text-neon-cyan" />
                        Health Insights
                    </h1>
                    <p className="text-text-secondary text-lg mt-1">Personal data, trends, and actionable recommendations.</p>
                </div>
                <Button variant="secondary" onClick={() => setIsGoalsModalOpen(true)}>
                    <Target className="w-5 h-5" />
                    Manage Goals
                </Button>
            </div>
            
            {/* Quick Stats Grid (TRACK) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <Card className='p-4'>
                    <p className='text-sm text-text-secondary'>Current Streak</p>
                    <p className='text-3xl font-bold text-neon-green flex items-center mt-1'>{insights.streak || 0} <Flame className='w-5 h-5 ml-1' /></p>
                </Card>
                <Card className='p-4'>
                    <p className='text-sm text-text-secondary'>Avg Daily Score (7D)</p>
                    <p className='text-3xl font-bold text-neon-cyan font-mono mt-1'>{insights.avg_daily_score.toFixed(1)} Pts</p>
                </Card>
                <Card className='p-4'>
                    <p className='text-sm text-text-secondary'>Total Goals Set</p>
                    <p className='text-3xl font-bold text-neon-pink font-mono mt-1'>{Object.keys(goals).length} Habits</p>
                </Card>
                <Card className='p-4'>
                    <p className='text-sm text-text-secondary'>Total Max Points</p>
                    <p className='text-3xl font-bold text-text-primary font-mono mt-1'>{maxScore.toFixed(0)} Pts</p>
                </Card>
            </div>
            
            {/* Recommendations (EDUCATE) */}
            <Card title="Actionable Recommendations" icon={Lightbulb} className='mb-8'>
                {insights.recommendations && insights.recommendations.length > 0 ? (
                    <div className='space-y-4'>
                        {insights.recommendations.map((rec, index) => (
                            <div key={index} className={`p-4 rounded-lg border flex items-start gap-4 ${
                                rec.priority === 'high' ? 'bg-red-900/40 border-neon-pink' :
                                rec.priority === 'medium' ? 'bg-yellow-900/40 border-neon-yellow' :
                                'bg-green-900/40 border-neon-green'
                            }`}>
                                <AlertCircle className={`w-6 h-6 flex-shrink-0 ${
                                    rec.priority === 'high' ? 'text-neon-pink' :
                                    rec.priority === 'medium' ? 'text-neon-yellow' :
                                    'text-neon-green'
                                }`} />
                                <div>
                                    <h3 className='text-lg font-semibold text-text-primary'>{rec.title}</h3>
                                    <p className='text-sm text-text-secondary'>{rec.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center p-6 text-text-secondary">
                        <Trophy className="w-10 h-10 mx-auto mb-2 text-neon-green" />
                        <p>You're on track! Keep up the great work.</p>
                    </div>
                )}
            </Card>

            {/* Historical Chart (TRACK) */}
            <Card title="Last 30 Days of Habit Scores" icon={TrendingUp}>
                {history.length > 0 ? (
                    <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#bf00ff" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#bf00ff" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#9ca3af" 
                                    tickFormatter={(tick) => new Date(tick).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                />
                                <YAxis 
                                    stroke="#9ca3af" 
                                    domain={[0, maxScore * 1.1]}
                                />
                                <Tooltip
                                    contentStyle={{ 
                                        backgroundColor: theme['--bg-card'], 
                                        border: `1px solid ${theme['--neon-cyan']}`, 
                                        borderRadius: theme['--radius-lg'], 
                                        color: theme['--text-primary'] 
                                    }}
                                    labelFormatter={(label) => `Date: ${new Date(label).toLocaleDateString()}`}
                                    formatter={(value, name) => [`${value.toFixed(1)} Pts`, name]}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="total_points" 
                                    stroke="#bf00ff" 
                                    fill="url(#colorTotal)"
                                    strokeWidth={3}
                                    name="Daily Total Points"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-center text-text-secondary p-10">Log some habits to see your history chart!</p>
                )}
            </Card>

            {/* Goals Management Modal */}
            {isGoalsModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
                    <div className="bg-bg-dark w-full max-w-lg rounded-xl border border-neon-cyan/20 shadow-2xl p-6">
                        <h2 className="text-2xl font-bold text-text-primary mb-4 border-b border-neon-cyan/20 pb-2">Manage Habit Goals</h2>
                        {goalsError && <ErrorMessage message={goalsError} />}
                        <form onSubmit={handleGoalSubmit} className="space-y-4">
                            {Object.entries(goalsForm).map(([key, value]) => {
                                const Icon = categoryIcons[key];
                                return (
                                    <div key={key} className="flex items-center justify-between p-2 bg-bg-elevated rounded-lg">
                                        <label className="text-text-secondary capitalize flex items-center gap-2">
                                            {Icon && <Icon className='w-5 h-5 text-neon-pink'/>}
                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                        </label>
                                        <input
                                            type="number"
                                            name={key}
                                            value={value || 0}
                                            onChange={handleGoalChange}
                                            min={0}
                                            step={key === 'nutrition' ? 1 : 0.5}
                                            className="w-24 p-2 bg-bg-card rounded-lg text-text-primary text-right font-mono"
                                        />
                                    </div>
                                );
                            })}
                            <div className="flex justify-end gap-3 pt-4">
                                <Button type="button" variant="secondary" onClick={() => setIsGoalsModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" loading={goalsLoading}>
                                    Save Goals
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- 5. App Setup ---

// Private/Public Route guards
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-darkest">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-darkest">
        <Spinner />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// Main App component
export default function App() {
  // Apply theme variables to the body/root element
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    // Set base Tailwind classes
    root.classList.add('bg-bg-dark', 'text-text-primary', 'font-body', 'min-h-screen');
  }, []);

  return (
    <Router>
        <AuthProvider>
            <Navbar />
            <main>
                <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                    <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
                    
                    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/league" element={<ProtectedRoute><League /></ProtectedRoute>} />
                    <Route path="/matchup" element={<ProtectedRoute><Matchup /></ProtectedRoute>} />
                    <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
                    
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </AuthProvider>
    </Router>
  );
}