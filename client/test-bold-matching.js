// テスト用のスクリプト
const matchBalancedBold = (text) => {
    const matches = [];
    let i = 0;
    while (i < text.length - 1) {
        if (text[i] === "[" && text[i + 1] === "[") {
            // 太字の開始を見つけた
            console.log(`Found [[ at position ${i}`);
            let depth = 1;
            let j = i + 2;
            let content = "";

            while (j < text.length && depth > 0) {
                console.log(`  j=${j}, char='${text[j]}', next='${text[j + 1] || "EOF"}', depth=${depth}`);
                if (j < text.length - 1 && text[j] === "[" && text[j + 1] === "[") {
                    // 入れ子の太字開始
                    console.log(`  Found nested [[ at ${j}`);
                    depth++;
                    content += "[[";
                    j += 2;
                } else if (j < text.length - 1 && text[j] === "]" && text[j + 1] === "]") {
                    // 太字の終了候補
                    console.log(`  Found ]] at ${j}, depth will be ${depth - 1}`);
                    depth--;
                    if (depth === 0) {
                        // マッチ完了
                        console.log(`  Match complete! content='${content}'`);
                        matches.push({ start: i, end: j + 2, content });
                        i = j + 2;
                        break;
                    } else {
                        content += "]]";
                        j += 2;
                    }
                } else {
                    content += text[j];
                    j++;
                }
            }

            if (depth > 0) {
                // マッチしなかった場合は次の文字へ
                console.log(`  No match found, depth=${depth}`);
                i++;
            }
        } else {
            i++;
        }
    }
    return matches;
};

const input = "[[bold text with [internal-link]]]";
console.log("Input:", input);
const matches = matchBalancedBold(input);
console.log("Matches:", JSON.stringify(matches, null, 2));
