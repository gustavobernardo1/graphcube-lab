# Compila o artigo (requer TeX Live com biber e latexmk).
# As tabelas/figuras/números são gerados por ../experiments/analysis/analyze.py
all: main.pdf

main.pdf: main.tex refs.bib sections/*.tex generated/numbers.tex generated/tables/*.tex
	latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex

analysis:
	cd .. && python3 experiments/analysis/analyze.py

clean:
	latexmk -C main.tex

.PHONY: all analysis clean
