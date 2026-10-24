#!/usr/bin/env bash
# Duas baixas simultâneas na mesma conta (valor 100; cada baixa de 60).
# Sem a trava de linha, ambas passariam e o valor pago ficaria 120.
set -uo pipefail
PSQL=("$@")
"${PSQL[@]}" -c "insert into public.parties (id, kind, person_type, name) values ('99000000-0000-0000-0000-000000000001','cliente','PF','Concorrência');
  insert into public.receivables (id, party_id, description, due_date, amount) values ('99000000-0000-0000-0000-000000000002','99000000-0000-0000-0000-000000000001','Concorrência', current_date, 100);" >/dev/null
pay() {
  "${PSQL[@]}" -c "begin; insert into public.receivable_payments (receivable_id, paid_at, amount, method) values ('99000000-0000-0000-0000-000000000002', current_date, 60, 'PIX'); select pg_sleep($1); commit;" >/dev/null 2>&1 && echo ok || echo bloqueado
}
pay 2 > "$TMPDIR_CONC/a" &
sleep 0.5
pay 0 > "$TMPDIR_CONC/b" &
wait
total=$("${PSQL[@]}" -tAc "select paid_amount from public.receivables where id = '99000000-0000-0000-0000-000000000002'")
echo "baixa A: $(cat "$TMPDIR_CONC/a") | baixa B: $(cat "$TMPDIR_CONC/b") | valor pago final: $total"
if [ "$(cat "$TMPDIR_CONC/a")" = ok ] && [ "$(cat "$TMPDIR_CONC/b")" = bloqueado ] && [ "$total" = "60.00" ]; then
  echo "OK concorrência: a segunda baixa simultânea foi recusada"
else
  echo "FALHA concorrência"; exit 1
fi
