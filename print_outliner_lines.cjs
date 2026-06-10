const fs = require('fs');
const content = fs.readFileSync('client/src/components/OutlinerItem.svelte', 'utf-8');
const lines = content.split('\n');
const linesToPrint = [9, 43, 62, 77, 87, 565, 568, 631, 634, 636, 648, 657, 668, 730, 736, 1435, 1436, 1598, 1625, 1691, 1704, 1707, 1711, 1739, 1794, 1809, 1810, 1811, 1812, 1813, 1817, 1818, 1819, 1825, 1827, 1828, 1829, 1830, 1832, 1834, 1835, 1842, 1844, 1903, 1916, 1917, 1918, 1919, 1920, 1921, 1931, 1932, 1933, 1934, 1935, 1936, 2014, 2016, 2017, 2084, 2085];
for (const line of linesToPrint) {
  console.log(`${line}: ${lines[line - 1]}`);
}
