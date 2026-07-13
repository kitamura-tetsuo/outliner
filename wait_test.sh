while pgrep -f "npm run test:e2e:basic" > /dev/null; do
    sleep 5
done
