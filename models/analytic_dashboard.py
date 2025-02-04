# analytic_manager\models\analytic_dashboard.py
from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from datetime import timedelta

class AnalyticDashboard(models.Model):
    _name = 'analytic.dashboard'
    _description = 'Tableau Analytique'

    name = fields.Many2one(
        'account.analytic.account',
        string="Code Projet",
        required=True,
        help="Sélectionnez le compte analytique associé au projet.",
        domain=[('code', '!=', False)]  
    )

    _sql_constraints = [
        ('unique_analytic_account', 'unique(name)', 'Un tableau analytique existe déjà pour ce projet !')
    ]

    libelle = fields.Char(
        string="Libellé",
    )

    date = fields.Date(
        'Date',
        required=True,
        index=True,
        default=fields.Date.context_today,
    )

    plan_id = fields.Many2one(
        comodel_name='account.analytic.plan',
        string="Plan Analytique",
    )

    marche_initial = fields.Float("Marché Initial")
    ts = fields.Float("Travaux Supplémentaires")
    factures_cumulees = fields.Float("Factures Cumulées", compute='_compute_factures_cumulees')
    non_facture = fields.Float("Non Facturé")
    trop_facture = fields.Float("Trop Facturé")
    depenses_cumulees = fields.Float(string="Dépenses Cumulées", compute='_compute_depenses_cumulees', store=False)
    debours_previsionnels = fields.Float("Débours Prévisionnels")
  
    # Champs supplémentaires à renseigner 
    od_facture = fields.Float("Opérations Diverses Facturées")
    oda_d = fields.Float("Ordres Divers d'Achats Décaissés")
    ffnp = fields.Float("Factures Fournisseurs Non Parvenues")
    stocks = fields.Float("Stocks")
    provisions = fields.Float("Provisions")
    

    ca_final = fields.Float(
        string="CA Final (FCFA)", 
        compute='_compute_ca_final', 
        store=False
    )
    activite_cumulee = fields.Float(
        string="Activité Cumulée (FCFA)", 
        compute='_compute_activite_cumulee', 
        store=False
    )

    # Champ pour le pourcentage d'avancement (décimal)
    pourcentage_avancement = fields.Float(
        string="Avancement (%)",
        compute='_compute_pourcentage_avancement',
        store=True  # Stockage dans la base de données
    )

    # Champ pour stocker le pourcentage sous forme d'entier
    stockage_pourcentage = fields.Integer(
        string="Stockage Pourcentage",
        compute='_compute_pourcentage_avancement',  
        store=True
    )

    resultat_chantier_cumule = fields.Float(
        string="Résultat Chantier Cumulé (FCFA)", 
        compute='_compute_resultat_chantier_cumule', 
        store=False
    )

     # Ajout des champs d'écart temporel
    ecart_activite = fields.Float(
        string="Écart Activité (FCFA)", 
        compute='_compute_ecart_activite', 
        store=False
    )

    ecart_depenses = fields.Float(
        string="Écart Dépenses (FCFA)", 
        compute='_compute_ecart_depenses', 
        store=False
    )


    def create_dashboard_for_all_analytic_accounts(self):
        """
        Cette méthode crée automatiquement un tableau de bord pour chaque compte analytique existant dans le système.
        """
        analytic_accounts = self.env['account.analytic.account'].search([])  # Recherche de tous les comptes analytiques
        created_count = 0
        for account in analytic_accounts:
            # Vérifie si un tableau analytique existe déjà pour ce compte analytique
            existing_dashboard = self.search([('name', '=', account.id)])
            if not existing_dashboard:
                # Crée un enregistrement dans 'analytic.dashboard' pour chaque compte analytique
                self.create({
                    'name': account.id,
                    'libelle': account.code,
                    'plan_id': account.plan_id.id,
                })
                created_count += 1

        if created_count > 0:
            return f"{created_count} Code projets créé(s)"
        else:
            return "Le tableau de bord est déjà à jour."

 
    # Récupère la réference et plan analytique asssocié au compte analytique / code projet
    @api.onchange('name')
    def _onchange_name(self):
        """
        Met à jour automatiquement les champs 'libelle' et 'plan_id' 
        en fonction du compte analytique sélectionné.
        """
        for record in self:
            if record.name:
                record.libelle = record.name.code
                record.plan_id = record.name.plan_id
            else:
                record.libelle = False
                record.plan_id = False


    @api.model
    def create(self, vals):
        if 'name' in vals:
            existing_dashboard = self.search([('name', '=', vals['name'])])
            if existing_dashboard:
                raise ValidationError(_('Une analyse analytique existe déjà pour ce projet !'))
        return super(AnalyticDashboard, self).create(vals)


    @api.depends('marche_initial', 'ts')
    def _compute_ca_final(self):
        for record in self:
            record.ca_final = round((record.marche_initial or 0) + (record.ts or 0), 2)

    # Calcule le total des factures fournisseurs
    @api.depends('name')
    def _compute_factures_cumulees(self):
        """
        Calcule le total hors taxes des factures fournisseurs,
        en soustrayant les montants des avoirs (factures d'avoir).
        """
        for record in self:
            if record.name:
                # Recherche des factures fournisseurs et des avoirs liés au compte analytique
                factures = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', 'in', ['in_invoice', 'in_refund']),
                    ('move_id.state', '=', 'posted')
                ])

                # Élimination des doublons en regroupant par facture
                move_ids = factures.mapped('move_id')

                # Calcul des totaux pour les factures et les avoirs
                total_factures = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'in_invoice')
                total_avoirs = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'in_refund')

                # Calcul final : Factures - Avoirs
                record.factures_cumulees = total_factures + total_avoirs
            else:
                record.factures_cumulees = 0.0

                
    # Calcule les dépenses cumulées
    @api.depends('factures_cumulees', 'oda_d', 'ffnp', 'stocks', 'provisions')
    def _compute_depenses_cumulees(self):
        """
        Dépenses cumulées = Factures Cumulées (fournisseurs) + ODA D. + Factures Fournisseurs Non Parvenues 
        + Stocks + Provisions
        """
        for record in self:
            record.depenses_cumulees = round(
                (record.factures_cumulees or 0) + 
                (record.oda_d or 0) + 
                (record.ffnp or 0) + 
                (record.stocks or 0) + 
                (record.provisions or 0), 2
            )

    # Calcule l'activité cumulée
    @api.depends('name', 'od_facture', 'non_facture', 'trop_facture')
    def _compute_activite_cumulee(self):
        """
        Calcule le total hors taxes des factures clients,
        en soustrayant les montants des factures d'avoir (out_refund).
        """
        for record in self:
            if record.name:
                # Recherche des factures et avoirs liés au compte analytique
                move_lines = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', 'in', ['out_invoice', 'out_refund']),
                    ('move_id.state', '=', 'posted')
                ])

                # Éliminer les doublons de factures
                move_ids = move_lines.mapped('move_id')

                # Calcul des factures et des avoirs
                total_factures = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'out_invoice')
                total_avoirs = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'out_refund')

                # Calcul final : Factures - Avoirs + ajustements
                record.activite_cumulee = (total_factures + total_avoirs) + \
                                        (record.od_facture or 0) + \
                                        (record.non_facture or 0) + \
                                        (record.trop_facture or 0)
            else:
                record.activite_cumulee = 0.0



    @api.depends('activite_cumulee', 'depenses_cumulees')
    def _compute_resultat_chantier_cumule(self):
        for record in self:
            # Vérifie si l'une des valeurs est nulle
            if record.activite_cumulee is None or record.depenses_cumulees is None:
                record.resultat_chantier_cumule = 0.0  # Ou une autre valeur par défaut si nécessaire
            else:
                # Calcule le résultat chantier cumulé uniquement si les deux valeurs sont non nulles
                record.resultat_chantier_cumule = round(record.activite_cumulee + record.depenses_cumulees, 2)


    @api.depends('activite_cumulee', 'ca_final')
    def _compute_pourcentage_avancement(self):
        for record in self:
            if record.ca_final:
                # Calcul du pourcentage avec 2 décimales
                record.pourcentage_avancement = round((record.activite_cumulee or 0) / record.ca_final * 100, 2)
                # Stockage en entier
                record.stockage_pourcentage = int(record.pourcentage_avancement)
            else:
                record.pourcentage_avancement = 0.0
                record.stockage_pourcentage = 0


     # Calcule l'écart d'activité par rapport au mois précédent
    @api.depends('name', 'activite_cumulee')
    def _compute_ecart_activite(self):
        for record in self:
            previous_month_date = fields.Date.today() - timedelta(days=30)
            previous_period = self.env['analytic.dashboard'].search([
                ('name', '=', record.name.id),
                ('date', '=', previous_month_date),
            ], limit=1)
            if previous_period:
                record.ecart_activite = round(record.activite_cumulee - previous_period.activite_cumulee, 2)
            else:
                record.ecart_activite = 0.0

    # Calcule l'écart de dépenses par rapport au mois précédent
    @api.depends('name', 'depenses_cumulees')
    def _compute_ecart_depenses(self):
        for record in self:
            previous_month_date = fields.Date.today() - timedelta(days=30)
            previous_period = self.env['analytic.dashboard'].search([
                ('name', '=', record.name.id),
                ('date', '=', previous_month_date),
            ], limit=1)
            if previous_period:
                record.ecart_depenses = round(record.depenses_cumulees - previous_period.depenses_cumulees, 2)
            else:
                record.ecart_depenses = 0.0

    
    # Ajout des méthodes supplémentaires pour l'analyse des projets
    def get_all_projets(self):
        """
        Retourne tous les projets, qu'ils soient en cours ou terminés.
        """
        projets = self.search([])
        projets_data = []
        
        for projet in projets:
            projets_data.append({
                'id_code_project': projet.name.id,
                'code_projet': projet.name.name,
                'libelle': projet.libelle,
                'pourcentage_avancement': projet.pourcentage_avancement,
                'resultat_chantier_cumule': projet.resultat_chantier_cumule,
                'ca_final': projet.ca_final,
                'date': projet.date,
                'plan_id': projet.plan_id.id, 
                'factures_cumulees': projet.factures_cumulees,
                'depenses_cumulees': projet.depenses_cumulees,  
                'activite_cumulee': projet.activite_cumulee,  
            })
        
        return projets_data


    @api.model
    def get_all_plans(self):
        """
        Retourne tous les plans analytiques disponibles.
        """
        plans = self.env['account.analytic.plan'].search([])
        plans_data = []

        print("Nombre de plans trouvés :", len(plans))

        for plan in plans:
            plans_data.append({
                'id': plan.id,
                'name': plan.name,
            })
            print("Plan ID:", plan.id, ", Nom:", plan.name)

        # Retourne les données dans un format structuré
        return {
            'count': len(plans),
            'plans': plans_data,
        }


    @api.model
    def get_resultat_chantier_total(self, start_date=None, end_date=None):
        # Logique pour calculer le résultat chantier total selon les dates
        domain = []
        if start_date:
            domain.append(('date', '>=', start_date))
        if end_date:
            domain.append(('date', '<=', end_date))

        total = sum(self.search(domain).mapped('resultat_chantier_cumule'))
        return {'resultat_chantier_total': total}
    

    @api.model
    def get_progression_moyenne(self, start_date=None, end_date=None):
        # Logique pour calculer la progression moyenne selon les dates
        domain = []
        if start_date:
            domain.append(('date', '>=', start_date))
        if end_date:
            domain.append(('date', '<=', end_date))

        progression = self.search(domain).mapped('pourcentage_avancement')
        if progression:
            return {'progression_moyenne': sum(progression) / len(progression)}
        return {'progression_moyenne': 0}
    
    def get_statistiques_projets(self):
        """
        Retourne des statistiques générales sur les projets sans distinction entre projets en cours et terminés.
        """
        projets = self.get_all_projets()  
        total_projets = len(projets) 
        return {
            'total_projets': total_projets,
            'resultat_chantier_total': self.get_resultat_chantier_total().get('resultat_chantier_total', 0),
            'progression_moyenne': self.get_progression_moyenne().get('progression_moyenne', 0),
        }
    
    def get_donnees_projets_independantes(self):
        """
        Retourne une liste des données indépendantes pour chaque projet.
        Chaque projet est représenté par un dictionnaire avec ses informations clés.
        """
        projets = self.get_all_projets() 
        projets_donnees = [] 

        for projet in projets:
            projet_donnees = {
                'id_code_project': projet['id_code_project'],
                'code_projet': projet['code_projet'],
                'libelle': projet['libelle'],
                'pourcentage_avancement': projet['pourcentage_avancement'],
                'resultat_chantier_cumule': projet['resultat_chantier_cumule'],
                'ca_final': projet['ca_final'],
                'date': projet['date'],
                'plan_id': projet['plan_id'],
                'factures_cumulees': projet['factures_cumulees'], 
                'depenses_cumulees': projet['depenses_cumulees'],
                'activite_cumulee' : projet['activite_cumulee'],
            }
            projets_donnees.append(projet_donnees)  
        
        return projets_donnees