const fs = require('fs');
const path = 'app/dashboard/vendor/page.tsx';
const content = fs.readFileSync(path, 'utf8');

// Identify blocks
const effectStart = '    useEffect(() => {';
const effectEnd = '    }, [profile, fetchStats]);';
const fetchStart = '    const fetchStats = useCallback(async () => {';
const fetchEnd = '    }, []);';

// Find indices
const effectStartIndex = content.indexOf(effectStart);
const effectEndIndex = content.indexOf(effectEnd) + effectEnd.length;
const fetchStartIndex = content.indexOf(fetchStart);
const fetchEndIndex = content.indexOf(fetchEnd) + fetchEnd.length;

if (effectStartIndex === -1 || effectEndIndex === -1 || fetchStartIndex === -1 || fetchEndIndex === -1) {
    console.error('Could not find all blocks');
    console.log('Effect Start:', effectStartIndex);
    console.log('Effect End:', effectEndIndex);
    console.log('Fetch Start:', fetchStartIndex);
    console.log('Fetch End:', fetchEndIndex);
    process.exit(1);
}

// Extract blocks
const effectBlock = content.substring(effectStartIndex, effectEndIndex);
const fetchBlock = content.substring(fetchStartIndex, fetchEndIndex);

// Identify the middle part (newline between blocks)
const middlePart = content.substring(effectEndIndex, fetchStartIndex);

// Construct new content
// Order: Pre-block + Fetch Block + Middle Part + Effect Block + Post-block
const newContent =
    content.substring(0, effectStartIndex) +
    fetchBlock +
    middlePart +
    effectBlock +
    content.substring(fetchEndIndex);

fs.writeFileSync(path, newContent);
console.log('Successfully swapped blocks');
